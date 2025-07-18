import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceLogs } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serviceName } = req.query;

  if (typeof serviceName !== 'string') {
    return res.status(400).json({ error: 'Invalid service name' });
  }

  try {
    const logs = await getServiceLogs(serviceName);
    res.status(200).json({ logs });
  } catch (error) {
    console.error('Service logs error:', error);
    res.status(500).json({ error: `Failed to get logs for ${serviceName}` });
  }
}
