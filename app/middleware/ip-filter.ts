import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export function ipFilter(req: Request, res: Response, next: NextFunction) {
  const clientIP = req.ip || req.socket.remoteAddress;
  
  if (!clientIP || !config.server.allowedIPs.includes(clientIP)) {
    logger.warn('Unauthorized access attempt', {
      ip: clientIP,
      path: req.path
    });
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  
  next();
}
