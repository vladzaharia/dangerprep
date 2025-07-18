import { NextApiRequest, NextApiResponse } from 'next';
import { getDockerServices } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const services = await getDockerServices();
    res.status(200).json(services);
  } catch (error) {
    console.error('Services error:', error);
    res.status(500).json({ error: 'Failed to get services information' });
  }
}
