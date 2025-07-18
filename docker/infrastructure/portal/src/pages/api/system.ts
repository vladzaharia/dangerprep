import { NextApiRequest, NextApiResponse } from 'next';
import { getSystemInfo } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const systemInfo = await getSystemInfo();
    res.status(200).json(systemInfo);
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Failed to get system information' });
  }
}
