/**
 * Smithery OAuth Flow
 *
 * Handles OAuth 2.0 authentication with Smithery
 */

import axios from 'axios';
import logger from '../logging/logger.js';
import { saveToken, getToken, deleteToken, updateToken } from './tokenStore.js';

// Smithery OAuth endpoints
const SMITHERY_AUTHORIZE_URL = 'https://smithery.ai/oauth/authorize';
const SMITHERY_TOKEN_URL = 'https://smithery.ai/oauth/token';
const SMITHERY_USER_URL = 'https://smithery.ai/api/user';

/**
 * Get Smithery OAuth credentials from environment
 */
function getSmitheryCredentials() {
  const clientId = process.env.SMITHERY_CLIENT_ID;
  const clientSecret = process.env.SMITHERY_CLIENT_SECRET;
  const redirectUri = process.env.SMITHERY_REDIRECT_URI || 'http://localhost:3000/oauth/smithery/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Smithery OAuth credentials not configured. Set SMITHERY_CLIENT_ID and SMITHERY_CLIENT_SECRET in .env');
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * GET /oauth/smithery/start
 * Redirect user to Smithery OAuth authorize URL
 */
export async function startSmitheryOAuth(req, res) {
  try {
    const { clientId, redirectUri } = getSmitheryCredentials();
    const scopes = req.query.scopes || 'read write';
    const state = req.query.state || `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: state,
      response_type: 'code'
    });

    const authorizeUrl = `${SMITHERY_AUTHORIZE_URL}?${params.toString()}`;

    logger.info('Starting Smithery OAuth flow', { scopes, state });

    // Store state in session/cookie for validation
    res.cookie('smithery_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });

    // Redirect to Smithery
    res.redirect(authorizeUrl);
  } catch (error) {
    logger.error('Failed to start Smithery OAuth', { error: error.message });
    res.status(500).json({
      error: 'Failed to start OAuth flow',
      message: error.message
    });
  }
}

/**
 * GET /oauth/smithery/callback
 * Handle OAuth callback from Smithery
 */
export async function handleSmitheryCallback(req, res) {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      logger.error('Smithery OAuth error', { error, error_description });
      return res.redirect(`/?oauth_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      logger.error('No authorization code received');
      return res.redirect('/?oauth_error=no_code');
    }

    // Validate state
    const savedState = req.cookies?.smithery_oauth_state;
    if (savedState && savedState !== state) {
      logger.error('State mismatch in OAuth callback', { expected: savedState, received: state });
      return res.redirect('/?oauth_error=state_mismatch');
    }

    logger.info('Received Smithery OAuth callback', { code: code.substr(0, 10) + '...', state });

    // Exchange code for access token
    const { clientId, clientSecret, redirectUri } = getSmitheryCredentials();

    const tokenResponse = await axios.post(SMITHERY_TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      logger.error('Smithery token exchange failed', { error: tokenData.error, description: tokenData.error_description });
      return res.redirect(`/?oauth_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    // Calculate expiry time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Get user info to verify token
    let userInfo = null;
    try {
      const userResponse = await axios.get(SMITHERY_USER_URL, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json'
        }
      });
      userInfo = userResponse.data;
      logger.info('Smithery OAuth successful', { user: userInfo.username || userInfo.email });
    } catch (error) {
      logger.warn('Failed to fetch Smithery user info', { error: error.message });
    }

    // Save token to encrypted storage
    await saveToken('smithery', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      token_type: tokenData.token_type,
      user_info: userInfo
    });

    // Clear state cookie
    res.clearCookie('smithery_oauth_state');

    // Redirect to UI with success
    res.redirect('/?oauth_success=smithery');
  } catch (error) {
    logger.error('Failed to handle Smithery OAuth callback', { error: error.message, stack: error.stack });
    res.redirect(`/?oauth_error=${encodeURIComponent(error.message)}`);
  }
}

/**
 * POST /oauth/smithery/refresh
 * Refresh Smithery access token using refresh token
 */
export async function refreshSmitheryToken(req, res) {
  try {
    const token = await getToken('smithery');

    if (!token) {
      return res.status(404).json({
        error: 'No Smithery token found',
        message: 'Please authenticate with Smithery first'
      });
    }

    if (!token.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token available',
        message: 'Smithery token does not support refresh. Please re-authenticate.'
      });
    }

    logger.info('Refreshing Smithery access token');

    const { clientId, clientSecret } = getSmitheryCredentials();

    const tokenResponse = await axios.post(SMITHERY_TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      logger.error('Smithery token refresh failed', { error: tokenData.error });
      return res.status(400).json({
        error: 'Token refresh failed',
        message: tokenData.error_description || tokenData.error
      });
    }

    // Calculate new expiry time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Update token
    await updateToken('smithery', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || token.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : token.scopes
    });

    logger.info('Smithery token refreshed successfully');

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expires_at: expiresAt
    });
  } catch (error) {
    logger.error('Failed to refresh Smithery token', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Failed to refresh token',
      message: error.message
    });
  }
}

/**
 * POST /oauth/smithery/disconnect
 * Disconnect Smithery account and delete tokens
 */
export async function disconnectSmithery(req, res) {
  try {
    const deleted = await deleteToken('smithery');

    if (!deleted) {
      return res.status(404).json({
        error: 'No Smithery token found',
        message: 'Already disconnected'
      });
    }

    logger.info('Smithery account disconnected');

    res.json({
      success: true,
      message: 'Smithery account disconnected successfully'
    });
  } catch (error) {
    logger.error('Failed to disconnect Smithery', { error: error.message });
    res.status(500).json({
      error: 'Failed to disconnect',
      message: error.message
    });
  }
}

/**
 * GET /oauth/smithery/status
 * Get Smithery OAuth connection status
 */
export async function getSmitheryStatus(req, res) {
  try {
    const token = await getToken('smithery');

    if (!token) {
      return res.json({
        connected: false,
        provider: 'smithery'
      });
    }

    const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

    res.json({
      connected: true,
      provider: 'smithery',
      scopes: token.scopes || [],
      expires_at: token.expires_at,
      expired: isExpired,
      has_refresh_token: !!token.refresh_token,
      user: token.user_info?.username || token.user_info?.email || null,
      created_at: token.created_at,
      updated_at: token.updated_at
    });
  } catch (error) {
    logger.error('Failed to get Smithery status', { error: error.message });
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
}

export default {
  startSmitheryOAuth,
  handleSmitheryCallback,
  refreshSmitheryToken,
  disconnectSmithery,
  getSmitheryStatus
};
