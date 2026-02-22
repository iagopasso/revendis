import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler';
import { requireMutationAuth } from './middleware/mutation-auth';
import routes from './routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', requireMutationAuth, routes);
app.use(errorHandler);

export default app;
