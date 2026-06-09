/**
 * Domain Management API Routes
 *
 * REST API for adding, removing, and managing custom domains with TLS.
 *
 * Endpoints:
 * - POST   /api/domains       - Add domain
 * - GET    /api/domains       - List domains
 * - GET    /api/domains/:name - Get domain details
 * - DELETE /api/domains/:name - Remove domain
 * - PUT    /api/domains/:name - Update domain
 * - POST   /api/domains/:name/enable  - Enable domain
 * - POST   /api/domains/:name/disable - Disable domain
 * - GET    /api/domains/certificates  - List TLS certificates
 */

import { Router, Request, Response } from 'express';
import logger from '../logging/logger.js';
import { getDomainManager, DomainOptions } from './manager.js';
import { isValidDomain, isValidWildcardDomain, normalizeDomain } from './validation.js';

const router = Router();

/**
 * @swagger
 * /api/domains:
 *   get:
 *     summary: List all domains
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of domains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domains:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Domain'
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const domainManager = getDomainManager();
    const domains = domainManager.listDomains();

    res.json({
      domains,
      count: domains.length,
    });
  } catch (error: any) {
    logger.error('Failed to list domains', { error: error.message });
    res.status(500).json({
      error: 'Failed to list domains',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains:
 *   post:
 *     summary: Add a new domain
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Domain name (e.g., example.com)
 *                 example: example.com
 *               tlsEnabled:
 *                 type: boolean
 *                 description: Enable automatic TLS via Let's Encrypt
 *                 default: true
 *     responses:
 *       201:
 *         description: Domain created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Domain'
 *       400:
 *         description: Invalid domain format
 *       409:
 *         description: Domain already exists
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { domain, tlsEnabled } = req.body;

    // Validate request
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Domain name is required',
      });
    }

    // Normalize and validate
    const normalized = normalizeDomain(domain);

    if (!isValidDomain(normalized) && !isValidWildcardDomain(normalized)) {
      return res.status(400).json({
        error: 'Invalid domain',
        message: `Invalid domain format: ${sanitizeString(domain)}`,
      });
    }

    // Add domain
    const domainManager = getDomainManager();
    const options: DomainOptions = {
      tlsEnabled: tlsEnabled !== false, // Default true
    };

    const newDomain = await domainManager.addDomain(normalized, options);

    logger.info('Domain added via API', { domain: sanitizeString(normalized) });

    res.status(201).json(newDomain);
  } catch (error: any) {
    logger.error('Failed to add domain', { error: error.message });

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Domain already exists',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to add domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/{name}:
 *   get:
 *     summary: Get domain details
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     responses:
 *       200:
 *         description: Domain details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Domain'
 *       404:
 *         description: Domain not found
 */
router.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const domainManager = getDomainManager();
    const domain = domainManager.getDomain(name);

    if (!domain) {
      return res.status(404).json({
        error: 'Domain not found',
        message: `Domain not found: ${sanitizeString(name)}`,
      });
    }

    res.json(domain);
  } catch (error: any) {
    logger.error('Failed to get domain', { error: error.message });
    res.status(500).json({
      error: 'Failed to get domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/{name}:
 *   put:
 *     summary: Update domain configuration
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tlsEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Domain updated
 *       404:
 *         description: Domain not found
 */
router.put('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { tlsEnabled } = req.body;

    const domainManager = getDomainManager();
    const options: Partial<DomainOptions> = {};

    if (tlsEnabled !== undefined) {
      options.tlsEnabled = tlsEnabled;
    }

    const updatedDomain = await domainManager.updateDomain(name, options);

    logger.info(`Domain updated via API: ${sanitizeString(name)}`);

    res.json(updatedDomain);
  } catch (error: any) {
    logger.error('Failed to update domain', { error: error.message });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Domain not found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to update domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/{name}:
 *   delete:
 *     summary: Remove a domain
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     responses:
 *       200:
 *         description: Domain removed
 *       404:
 *         description: Domain not found
 */
router.delete('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const domainManager = getDomainManager();

    await domainManager.removeDomain(name);

    logger.info(`Domain removed via API: ${sanitizeString(name)}`);

    res.json({
      message: 'Domain removed successfully',
      domain: name,
    });
  } catch (error: any) {
    logger.error('Failed to remove domain', { error: error.message });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Domain not found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to remove domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/{name}/enable:
 *   post:
 *     summary: Enable a domain
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     responses:
 *       200:
 *         description: Domain enabled
 *       404:
 *         description: Domain not found
 */
router.post('/:name/enable', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const domainManager = getDomainManager();

    const domain = await domainManager.toggleDomain(name, true);
    const normalizedName = normalizeDomain(name);
    const safeDomainForLog =
    const normalizedName = normalizeDomain(name);
    const safeNameForLog =
      isValidDomain(normalizedName) || isValidWildcardDomain(normalizedName)
        ? normalizedName
        : '[INVALID_DOMAIN]';
    logger.info(`Domain enabled via API: ${safeNameForLog}`);
    const safeNameForLog =
      isValidDomain(normalizedName) || isValidWildcardDomain(normalizedName)
        ? normalizedName
        : '[INVALID_DOMAIN]';
    logger.info(`Domain enabled via API: ${safeNameForLog}`);
        ? normalizedName
        : '[INVALID_DOMAIN]';

    logger.info(`Domain enabled via API: ${safeDomainForLog}`);

    res.json(domain);
  } catch (error: any) {
    logger.error('Failed to enable domain', { error: error.message });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Domain not found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to enable domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/{name}/disable:
 *   post:
 *     summary: Disable a domain
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Domain name
 *     responses:
 *       200:
 *         description: Domain disabled
 *       404:
 *         description: Domain not found
 */
router.post('/:name/disable', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const domainManager = getDomainManager();

    const domain = await domainManager.toggleDomain(name, false);
    const normalizedName = normalizeDomain(name);
    const safeDomainForLog =
      isValidDomain(normalizedName) || isValidWildcardDomain(normalizedName)
        ? normalizedName
        : '[INVALID_DOMAIN]';

    logger.info(`Domain disabled via API: ${safeDomainForLog}`);

    res.json(domain);
  } catch (error: any) {
    logger.error('Failed to disable domain', { error: error.message });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Domain not found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to disable domain',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/domains/certificates:
 *   get:
 *     summary: List TLS certificates
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of TLS certificates
 */
router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const domainManager = getDomainManager();
    const certificates = await domainManager.getCertificates();

    res.json({
      certificates,
      count: certificates.length,
    });
  } catch (error: any) {
    logger.error('Failed to list certificates', { error: error.message });
    res.status(500).json({
      error: 'Failed to list certificates',
      message: error.message,
    });
  }
});

export { router as domainRouter };
