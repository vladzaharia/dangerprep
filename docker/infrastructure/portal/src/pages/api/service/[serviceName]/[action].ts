import { NextApiRequest, NextApiResponse } from 'next';
import { controlDockerService } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serviceName, action } = req.query;

  if (typeof serviceName !== 'string' || typeof action !== 'string') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await controlDockerService(serviceName, action as 'start' | 'stop' | 'restart');
    res.status(200).json({ success: `${action} completed for ${serviceName}` });
  } catch (error) {
    console.error(`Service ${action} error:`, error);
    res.status(500).json({ error: `Failed to ${action} service ${serviceName}` });
  }
}
