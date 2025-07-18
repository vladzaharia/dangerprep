import { NextApiRequest, NextApiResponse } from 'next';
import { getNetworkInfo } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const networkInfo = await getNetworkInfo();
    res.status(200).json(networkInfo);
  } catch (error) {
    console.error('Network info error:', error);
    res.status(500).json({ error: 'Failed to get network information' });
  }
}
