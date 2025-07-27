import { Hono } from 'hono';
import { Env } from '../types/env';

import { contentRoutes } from './content';
import { adminRoutes } from './admin';
import { webhookRoutes } from './webhooks';
import { apiRoutes } from './api';

export function setupRoutes(app: Hono<{ Bindings: Env }>) {
  // Content management routes
  app.route('/api/content', contentRoutes);
  
  // Admin dashboard routes
  app.route('/admin', adminRoutes);
  
  // Webhook handlers
  app.route('/webhooks', webhookRoutes);
  
  // General API routes
  app.route('/api', apiRoutes);
}