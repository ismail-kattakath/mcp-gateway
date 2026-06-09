/**
 * LDAP Provider API Routes
 *
 * REST API endpoints for managing LDAP/AD providers.
 * Requires authentication (Bearer token).
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { Router, Request, Response } from 'express';
import { ldapProvidersModel } from '../storage/models/ldap-providers.js';
import { destroyLDAPClient } from '../auth/strategies/ldap/strategy.js';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';

export function createLDAPRouter(): Router {
  const router = Router();

  /**
   * @openapi
   * /api/ldap/providers:
   *   get:
   *     summary: List all LDAP providers
   *     description: Returns a list of all configured LDAP/AD providers
   *     tags:
   *       - LDAP
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of LDAP providers
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/LDAPProvider'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/providers', (req: Request, res: Response) => {
    try {
      const providers = ldapProvidersModel.list();
      res.json(providers);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list LDAP providers', {
        error: sanitizeString(err.message),
      });
      res.status(500).json({ error: 'Failed to list LDAP providers' });
    }
  });

  /**
   * @openapi
   * /api/ldap/providers/{name}:
   *   get:
   *     summary: Get LDAP provider details
   *     description: Returns detailed configuration for a specific LDAP provider
   *     tags:
   *       - LDAP
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider name
   *         example: openldap
   *     responses:
   *       200:
   *         description: LDAP provider details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LDAPProvider'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/providers/:name', (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const provider = ldapProvidersModel.findByName(name);

      if (!provider) {
        return res.status(404).json({ error: `LDAP provider '${name}' not found` });
      }

      res.json(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get LDAP provider', {
        name: sanitizeString(req.params.name),
        error: sanitizeString(err.message),
      });
      res.status(500).json({ error: 'Failed to get LDAP provider' });
    }
  });

  /**
   * @openapi
   * /api/ldap/providers:
   *   post:
   *     summary: Create LDAP provider
   *     description: Add a new LDAP/AD provider
   *     tags:
   *       - LDAP
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateLDAPProvider'
   *     responses:
   *       201:
   *         description: LDAP provider created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LDAPProvider'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       409:
   *         description: Provider already exists
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/providers', async (req: Request, res: Response) => {
    try {
      const provider = await ldapProvidersModel.create(req.body);
      res.status(201).json(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create LDAP provider', {
        error: sanitizeString(err.message),
      });

      if (err.message.includes('already exists')) {
        return res.status(409).json({ error: err.message });
      }

      res.status(400).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/ldap/providers/{name}:
   *   put:
   *     summary: Update LDAP provider
   *     description: Update LDAP provider configuration
   *     tags:
   *       - LDAP
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider name
   *         example: openldap
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateLDAPProvider'
   *     responses:
   *       200:
   *         description: LDAP provider updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LDAPProvider'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.put('/providers/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const provider = ldapProvidersModel.findByName(name);

      if (!provider) {
        return res.status(404).json({ error: `LDAP provider '${name}' not found` });
      }

      const updated = await ldapProvidersModel.update(provider.id, req.body);

      // Destroy cached LDAP client to force re-initialization with new config
      await destroyLDAPClient(name);

      logger.info('LDAP provider updated', {
        name: sanitizeString(name),
      });

      res.json(updated);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update LDAP provider', {
        name: sanitizeString(req.params.name),
        error: sanitizeString(err.message),
      });
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/ldap/providers/{name}:
   *   delete:
   *     summary: Delete LDAP provider
   *     description: Remove LDAP provider configuration
   *     tags:
   *       - LDAP
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider name
   *         example: openldap
   *     responses:
   *       200:
   *         description: LDAP provider deleted
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: LDAP provider deleted
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.delete('/providers/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const provider = ldapProvidersModel.findByName(name);

      if (!provider) {
        return res.status(404).json({ error: `LDAP provider '${name}' not found` });
      }

      await ldapProvidersModel.delete(provider.id);

      // Destroy cached LDAP client
      await destroyLDAPClient(name);

      logger.info('LDAP provider deleted', {
        name: sanitizeString(name),
      });

      res.json({ message: 'LDAP provider deleted' });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete LDAP provider', {
        name: sanitizeString(req.params.name),
        error: sanitizeString(err.message),
      });
      res.status(500).json({ error: 'Failed to delete LDAP provider' });
    }
  });

  return router;
}

export default createLDAPRouter;
