import { Hono } from 'hono';
import { Env } from '../types/env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Admin dashboard
adminRoutes.get('/', async (c) => {
  // TODO: Serve admin dashboard HTML
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CCC Admin Dashboard</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .status { padding: 4px 8px; border-radius: 4px; color: white; }
        .status.pending { background: #ffa500; }
        .status.active { background: #4caf50; }
        .status.error { background: #f44336; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>CCC Facebook Generator - Admin Dashboard</h1>
        
        <div class="card">
          <h2>System Status</h2>
          <p>Status: <span class="status pending">Under Development</span></p>
          <p>Last Content Generation: Not yet implemented</p>
          <p>Last Facebook Post: Not yet implemented</p>
        </div>
        
        <div class="card">
          <h2>Quick Actions</h2>
          <button onclick="generateContent()">Generate Test Content</button>
          <button onclick="checkStatus()">Check System Status</button>
        </div>
        
        <div class="card">
          <h2>Recent Activity</h2>
          <p>Activity log will be implemented in Phase 2</p>
        </div>
      </div>
      
      <script>
        function generateContent() {
          fetch('/api/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'test', prompt: 'Generate a cute cat image' })
          })
          .then(r => r.json())
          .then(data => alert('Generation queued: ' + JSON.stringify(data)))
          .catch(err => alert('Error: ' + err));
        }
        
        function checkStatus() {
          fetch('/api/status')
          .then(r => r.json())
          .then(data => alert('Status: ' + JSON.stringify(data)))
          .catch(err => alert('Error: ' + err));
        }
      </script>
    </body>
    </html>
  `);
});

// Get system statistics
adminRoutes.get('/stats', async (c) => {
  try {
    // TODO: Implement system statistics from D1
    return c.json({
      success: true,
      data: {
        totalContent: 0,
        pendingPosts: 0,
        successfulPosts: 0,
        failedPosts: 0,
        lastGeneration: null,
        lastPost: null
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to fetch statistics'
    }, 500);
  }
});

// Manual content approval
adminRoutes.post('/content/:id/approve', async (c) => {
  try {
    const contentId = c.req.param('id');
    
    // TODO: Implement content approval workflow
    return c.json({
      success: true,
      data: { contentId, status: 'approved' },
      message: 'Content approved'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to approve content'
    }, 500);
  }
});

// Manual content rejection
adminRoutes.post('/content/:id/reject', async (c) => {
  try {
    const contentId = c.req.param('id');
    const { reason } = await c.req.json();
    
    // TODO: Implement content rejection workflow
    return c.json({
      success: true,
      data: { contentId, status: 'rejected', reason },
      message: 'Content rejected'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to reject content'
    }, 500);
  }
});