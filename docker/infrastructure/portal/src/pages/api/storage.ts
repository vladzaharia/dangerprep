import { NextApiRequest, NextApiResponse } from 'next';
import { getStorageInfo } from '@/lib/system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const storageInfo = await getStorageInfo();
    res.status(200).json(storageInfo);
  } catch (error) {
    console.error('Storage info error:', error);
    res.status(500).json({ error: 'Failed to get storage information' });
  }
}
