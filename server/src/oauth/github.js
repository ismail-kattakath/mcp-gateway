/**
 * GitHub OAuth Flow
 *
 * Handles OAuth 2.0 authentication with GitHub
 */

import axios from 'axios';
import logger from '../logging/logger.js';
import { saveToken, getToken, deleteToken, updateToken } from './tokenStore.js';

// GitHub OAuth endpoints
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * Get GitHub OAuth credentials from environment
 */
function getGitHubCredentials() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/oauth/github/callback';

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth credentials not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env');
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * GET /oauth/github/start
 * Redirect user to GitHub OAuth authorize URL
 */
export async function startGitHubOAuth(req, res) {
  try {
    const { clientId, redirectUri } = getGitHubCredentials();
    const scopes = req.query.scopes || 'repo,read:org,read:user';
    const state = req.query.state || `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: state,
      response_type: 'code'
    });

    const authorizeUrl = `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;

    logger.info('Starting GitHub OAuth flow', { scopes, state });

    // Store state in session/cookie for validation (optional security enhancement)
    res.cookie('github_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });

    // Redirect to GitHub
    res.redirect(authorizeUrl);
  } catch (error) {
    logger.error('Failed to start GitHub OAuth', { error: error.message });
    res.status(500).json({
      error: 'Failed to start OAuth flow',
      message: error.message
    });
  }
}

/**
 * GET /oauth/github/callback
 * Handle OAuth callback from GitHub
 */
export async function handleGitHubCallback(req, res) {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      logger.error('GitHub OAuth error', { error, error_description });
      return res.redirect(`/?oauth_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      logger.error('No authorization code received');
      return res.redirect('/?oauth_error=no_code');
    }

    // Validate state (optional security check)
    const savedState = req.cookies?.github_oauth_state;
    if (savedState && savedState !== state) {
      logger.error('State mismatch in OAuth callback', { expected: savedState, received: state });
      return res.redirect('/?oauth_error=state_mismatch');
    }

    logger.info('Received GitHub OAuth callback', { code: code.substr(0, 10) + '...', state });

    // Exchange code for access token
    const { clientId, clientSecret, redirectUri } = getGitHubCredentials();

    const tokenResponse = await axios.post(GITHUB_TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri
    }, {
      headers: {
        'Accept': 'application/json'
      }
    });

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      logger.error('GitHub token exchange failed', { error: tokenData.error, description: tokenData.error_description });
      return res.redirect(`/?oauth_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    // Calculate expiry time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Get user info to verify token
    let userInfo = null;
    try {
      const userResponse = await axios.get(GITHUB_USER_URL, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      userInfo = userResponse.data;
      logger.info('GitHub OAuth successful', { user: userInfo.login, id: userInfo.id });
    } catch (error) {
      logger.warn('Failed to fetch GitHub user info', { error: error.message });
    }

    // Save token to encrypted storage
    await saveToken('github', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      token_type: tokenData.token_type,
      user_info: userInfo
    });

    // Clear state cookie
    res.clearCookie('github_oauth_state');

    // Redirect to UI with success
    res.redirect('/?oauth_success=github');
  } catch (error) {
    logger.error('Failed to handle GitHub OAuth callback', { error: error.message, stack: error.stack });
    res.redirect(`/?oauth_error=${encodeURIComponent(error.message)}`);
  }
}

/**
 * POST /oauth/github/refresh
 * Refresh GitHub access token using refresh token
 */
export async function refreshGitHubToken(req, res) {
  try {
    const token = await getToken('github');

    if (!token) {
      return res.status(404).json({
        error: 'No GitHub token found',
        message: 'Please authenticate with GitHub first'
      });
    }

    if (!token.refresh_token) {
      return res.status(400).json({
        error: 'No refresh token available',
        message: 'GitHub token does not support refresh. Please re-authenticate.'
      });
    }

    logger.info('Refreshing GitHub access token');

    const { clientId, clientSecret } = getGitHubCredentials();

    const tokenResponse = await axios.post(GITHUB_TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token
    }, {
      headers: {
        'Accept': 'application/json'
      }
    });

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      logger.error('GitHub token refresh failed', { error: tokenData.error });
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
    await updateToken('github', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || token.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(',') : token.scopes
    });

    logger.info('GitHub token refreshed successfully');

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expires_at: expiresAt
    });
  } catch (error) {
    logger.error('Failed to refresh GitHub token', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Failed to refresh token',
      message: error.message
    });
  }
}

/**
 * POST /oauth/github/disconnect
 * Disconnect GitHub account and delete tokens
 */
export async function disconnectGitHub(req, res) {
  try {
    const deleted = await deleteToken('github');

    if (!deleted) {
      return res.status(404).json({
        error: 'No GitHub token found',
        message: 'Already disconnected'
      });
    }

    logger.info('GitHub account disconnected');

    res.json({
      success: true,
      message: 'GitHub account disconnected successfully'
    });
  } catch (error) {
    logger.error('Failed to disconnect GitHub', { error: error.message });
    res.status(500).json({
      error: 'Failed to disconnect',
      message: error.message
    });
  }
}

/**
 * GET /oauth/github/status
 * Get GitHub OAuth connection status
 */
export async function getGitHubStatus(req, res) {
  try {
    const token = await getToken('github');

    if (!token) {
      return res.json({
        connected: false,
        provider: 'github'
      });
    }

    const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

    res.json({
      connected: true,
      provider: 'github',
      scopes: token.scopes || [],
      expires_at: token.expires_at,
      expired: isExpired,
      has_refresh_token: !!token.refresh_token,
      user: token.user_info?.login || null,
      created_at: token.created_at,
      updated_at: token.updated_at
    });
  } catch (error) {
    logger.error('Failed to get GitHub status', { error: error.message });
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
}

export default {
  startGitHubOAuth,
  handleGitHubCallback,
  refreshGitHubToken,
  disconnectGitHub,
  getGitHubStatus
};
