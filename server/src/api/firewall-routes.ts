/**
 * Firewall API Routes
 *
 * REST API endpoints for managing firewall rules (IP filtering).
 * Related: Epic #23 (Network Security)
 */

import { Router, Request, Response } from 'express';
import {
  listFirewallRules,
  createFirewallRule,
  getFirewallRuleById,
  updateFirewallRule,
  deleteFirewallRule,
  deleteAllFirewallRulesByTenant,
} from '../storage/models/firewall-rules.js';
import {
  loadFirewallConfig,
  saveFirewallConfig,
  type FirewallConfig,
} from '../security/firewall/config.js';
import { testIpAgainstRules } from '../security/firewall/ipfilter.js';
import { validateIpRange } from '../security/firewall/migration.js';
import { syncIptablesToDatabase } from '../security/firewall/iptables.js';
import logger, { sanitizeString } from '../logging/logger.js';

export function createFirewallRouter(): Router {
  const router = Router();

  /**
   * @openapi
   * /api/firewall:
   *   get:
   *     summary: List firewall rules
   *     description: Returns a list of all firewall rules with optional filters
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: rule_type
   *         schema:
   *           type: string
   *           enum: [allow, deny]
   *         description: Filter by rule type
   *       - in: query
   *         name: enabled
   *         schema:
   *           type: boolean
   *         description: Filter by enabled status
   *       - in: query
   *         name: tenant
   *         schema:
   *           type: string
   *         description: Filter by tenant
   *     responses:
   *       200:
   *         description: List of firewall rules
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/FirewallRule'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const { rule_type, enabled, tenant } = req.query;

      const options: any = {};

      if (rule_type) {
        options.rule_type = rule_type;
      }

      if (enabled !== undefined) {
        options.enabled = enabled === 'true';
      }

      if (tenant !== undefined) {
        options.tenant = tenant === 'null' ? null : tenant;
      }

      const rules = listFirewallRules(options);
      return res.json(rules);
    } catch (error) {
      logger.error('Failed to list firewall rules', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall:
   *   post:
   *     summary: Create firewall rule
   *     description: Add a new IP filtering rule (allow or deny)
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - ip_range
   *               - rule_type
   *             properties:
   *               ip_range:
   *                 type: string
   *                 description: IP address or CIDR range
   *                 example: 192.168.1.0/24
   *               rule_type:
   *                 type: string
   *                 enum: [allow, deny]
   *                 description: Rule type
   *               description:
   *                 type: string
   *                 description: Human-readable description
   *               enabled:
   *                 type: boolean
   *                 default: true
   *               tenant:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       201:
   *         description: Rule created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FirewallRule'
   *       400:
   *         description: Invalid input
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { ip_range, rule_type, description, enabled, tenant } = req.body;

      // Validate required fields
      if (!ip_range || !rule_type) {
        return res.status(400).json({
          error: 'Missing required fields: ip_range, rule_type',
        });
      }

      // Validate rule_type
      if (rule_type !== 'allow' && rule_type !== 'deny') {
        return res.status(400).json({
          error: 'Invalid rule_type. Must be "allow" or "deny"',
        });
      }

      // Validate IP range
      const validation = validateIpRange(ip_range);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
        });
      }

      // Create rule
      const rule = await createFirewallRule({
        ip_range,
        rule_type,
        description,
        enabled: enabled !== undefined ? enabled : true,
        tenant: tenant ?? null,
      });

      // Sync iptables if enabled
      const config = await loadFirewallConfig(tenant);
      if (config.iptablesEnabled) {
        try {
          await syncIptablesToDatabase(3000, tenant);
        } catch (error) {
          logger.warn('Failed to sync iptables after rule creation', { error });
        }
      }

      return res.status(201).json(rule);
    } catch (error) {
      logger.error('Failed to create firewall rule', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/{id}:
   *   get:
   *     summary: Get firewall rule
   *     description: Get a specific firewall rule by ID
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Rule ID
   *     responses:
   *       200:
   *         description: Rule details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FirewallRule'
   *       404:
   *         description: Rule not found
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rule = getFirewallRuleById(id);

      if (!rule) {
        return res.status(404).json({ error: `Firewall rule not found: ${id}` });
      }

      return res.json(rule);
    } catch (error) {
      logger.error('Failed to get firewall rule', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/{id}:
   *   put:
   *     summary: Update firewall rule
   *     description: Update an existing firewall rule
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Rule ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               ip_range:
   *                 type: string
   *               rule_type:
   *                 type: string
   *                 enum: [allow, deny]
   *               description:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Rule updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FirewallRule'
   *       404:
   *         description: Rule not found
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ip_range, rule_type, description, enabled } = req.body;

      // Validate rule_type if provided
      if (rule_type && rule_type !== 'allow' && rule_type !== 'deny') {
        return res.status(400).json({
          error: 'Invalid rule_type. Must be "allow" or "deny"',
        });
      }

      // Validate IP range if provided
      if (ip_range) {
        const validation = validateIpRange(ip_range);
        if (!validation.valid) {
          return res.status(400).json({
            error: validation.error,
          });
        }
      }

      const updates: any = {};
      if (ip_range !== undefined) updates.ip_range = ip_range;
      if (rule_type !== undefined) updates.rule_type = rule_type;
      if (description !== undefined) updates.description = description;
      if (enabled !== undefined) updates.enabled = enabled;

      const rule = await updateFirewallRule(id, updates);

      // Sync iptables if enabled
      const existingRule = getFirewallRuleById(id);
      if (existingRule) {
        const config = await loadFirewallConfig(existingRule.tenant ?? undefined);
        if (config.iptablesEnabled) {
          try {
            await syncIptablesToDatabase(3000, existingRule.tenant ?? undefined);
          } catch (error) {
            logger.warn('Failed to sync iptables after rule update', { error });
          }
        }
      }

      return res.json(rule);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Failed to update firewall rule', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/{id}:
   *   delete:
   *     summary: Delete firewall rule
   *     description: Remove a firewall rule
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Rule ID
   *     responses:
   *       204:
   *         description: Rule deleted successfully
   *       404:
   *         description: Rule not found
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const existingRule = getFirewallRuleById(id);

      if (!existingRule) {
        return res.status(404).json({ error: `Firewall rule not found: ${id}` });
      }

      deleteFirewallRule(id);

      // Sync iptables if enabled
      const config = await loadFirewallConfig(existingRule.tenant ?? undefined);
      if (config.iptablesEnabled) {
        syncIptablesToDatabase(3000, existingRule.tenant ?? undefined).catch((error) => {
          logger.warn('Failed to sync iptables after rule deletion', { error });
        });
      }

      return res.status(204).send();
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Failed to delete firewall rule', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/config:
   *   get:
   *     summary: Get firewall configuration
   *     description: Get current firewall settings
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenant
   *         schema:
   *           type: string
   *         description: Tenant name
   *     responses:
   *       200:
   *         description: Firewall configuration
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FirewallConfig'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const { tenant } = req.query;
      const config = await loadFirewallConfig(tenant as string | undefined);
      return res.json(config);
    } catch (error) {
      logger.error('Failed to load firewall config', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/config:
   *   post:
   *     summary: Update firewall configuration
   *     description: Update firewall settings (enable/disable, mode, iptables)
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               enabled:
   *                 type: boolean
   *               mode:
   *                 type: string
   *                 enum: [whitelist, blacklist]
   *               iptablesEnabled:
   *                 type: boolean
   *               iptablesChain:
   *                 type: string
   *               iptablesSudo:
   *                 type: boolean
   *               tenant:
   *                 type: string
   *     responses:
   *       200:
   *         description: Configuration updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FirewallConfig'
   *       400:
   *         description: Invalid input
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const { enabled, mode, iptablesEnabled, iptablesChain, iptablesSudo, tenant } = req.body;

      // Validate mode
      if (mode && mode !== 'whitelist' && mode !== 'blacklist') {
        return res.status(400).json({
          error: 'Invalid mode. Must be "whitelist" or "blacklist"',
        });
      }

      const updates: Partial<FirewallConfig> = {};

      if (enabled !== undefined) updates.enabled = enabled;
      if (mode !== undefined) updates.mode = mode;
      if (iptablesEnabled !== undefined) updates.iptablesEnabled = iptablesEnabled;
      if (iptablesChain !== undefined) updates.iptablesChain = iptablesChain;
      if (iptablesSudo !== undefined) updates.iptablesSudo = iptablesSudo;

      await saveFirewallConfig(updates, tenant);

      // Sync iptables if enabled
      if (iptablesEnabled) {
        try {
          await syncIptablesToDatabase(3000, tenant);
        } catch (error) {
          logger.warn('Failed to sync iptables after config update', { error });
        }
      }

      const config = await loadFirewallConfig(tenant);
      return res.json(config);
    } catch (error) {
      logger.error('Failed to save firewall config', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/test/{ip}:
   *   get:
   *     summary: Test IP against firewall rules
   *     description: Check if an IP address would be allowed or denied
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: ip
   *         required: true
   *         schema:
   *           type: string
   *         description: IP address to test
   *         example: 192.168.1.100
   *       - in: query
   *         name: tenant
   *         schema:
   *           type: string
   *         description: Tenant name
   *     responses:
   *       200:
   *         description: Test result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 allowed:
   *                   type: boolean
   *                 reason:
   *                   type: string
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/test/:ip', async (req: Request, res: Response) => {
    try {
      const { ip } = req.params;
      const { tenant } = req.query;

      const result = await testIpAgainstRules(ip, tenant as string | undefined);
      return res.json(result);
    } catch (error) {
      logger.error('Failed to test IP', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @openapi
   * /api/firewall/flush:
   *   post:
   *     summary: Flush all firewall rules
   *     description: Delete all firewall rules (WARNING - destructive)
   *     tags:
   *       - Firewall
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenant
   *         schema:
   *           type: string
   *         description: Tenant name
   *     responses:
   *       204:
   *         description: All rules deleted
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/flush', async (req: Request, res: Response) => {
    try {
      const { tenant } = req.query;
      deleteAllFirewallRulesByTenant((tenant as string | null) ?? null);

      // Sync iptables if enabled
      const config = await loadFirewallConfig(tenant as string | undefined);
      if (config.iptablesEnabled) {
        syncIptablesToDatabase(3000, tenant as string | undefined).catch((error) => {
          logger.warn('Failed to sync iptables after flush', { error });
        });
      }

      return res.status(204).send();
    } catch (error) {
      logger.error('Failed to flush firewall rules', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
