import { Router } from 'express';
import {
  scheduleEmailBatch,
  getScheduledEmails,
  getSentEmails,
  handleSearchEmails,
  deleteEmailJob,
  deleteEmailJobsBulk,
} from './emails.controller';
import { requireAuth } from '../../middleware';

export const emailsRouter = Router();

emailsRouter.get('/search', requireAuth, handleSearchEmails);

emailsRouter.post('/schedule', requireAuth, scheduleEmailBatch);
emailsRouter.get('/scheduled', requireAuth, getScheduledEmails);
emailsRouter.get('/sent', requireAuth, getSentEmails);

// Delete routes (bulk must come before :id to prevent matching 'bulk' as id)
emailsRouter.delete('/bulk', requireAuth, deleteEmailJobsBulk);
emailsRouter.delete('/:id', requireAuth, deleteEmailJob);

export default emailsRouter;
