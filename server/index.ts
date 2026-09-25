import { resolve } from 'node:path';
import { createDemoServer } from './app';

if (process.env.NODE_ENV === 'production' || process.env.CASA_TE_ENV === 'production') {
  throw new Error('The unauthenticated demo order server must never run as a production service.');
}

const port = Number(process.env.ORDER_DEMO_PORT ?? 8787);
const host = process.env.ORDER_DEMO_HOST ?? '0.0.0.0';
const dataFile = resolve(process.env.ORDER_DEMO_DATA_FILE ?? 'demo-data/orders.json');
createDemoServer(dataFile).listen(port, host, () => {
  console.log(`CASA & TE admin: http://localhost:${port}`);
  console.log(`Order archive: ${dataFile}`);
});
