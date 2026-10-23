// Worker entry. Static files in web/ are served by Workers assets before this runs.
import { app } from './app';

export default { fetch: app.fetch };
