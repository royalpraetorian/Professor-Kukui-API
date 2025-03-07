import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import favicon from 'serve-favicon';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import * as eta from 'eta';

import * as middleware from './middleware/index.js';
import * as routers from './routers/index.js';
import * as pokedexRouter from './routers/pokedex.js';
import * as fileReader from './services/fileReader.js';
import assets from '../public/build/assets.js';
import { env, paths } from '../utils/index.js';
import bodyParser from 'body-parser';

const app = express();

// locals variable assignments for template usage
app.locals.assets = assets;
app.locals.isDev = env.isDev;

//On startup load data folder into cache
app.data = {
  moves: {},
  pokedex: {},
  formats: []
};
fileReader.loadDataFolder();

// app view engine and directory config
eta.configure({ cache: env.isProd });
app
  .engine('eta', eta.renderFile)
  .set('view engine', 'eta')
  .set('views', `${paths.assets}/views`);

// app middleware
app
  .use(helmet())
  .use(middleware.httpLogger())
  .use(cookieParser())
  .use(compression())
  .use(express.json())
  .use(express.urlencoded({ extended: true }), hpp())
  .use(express.static(paths.public))
  .use(favicon(`${paths.public}/favicon.ico`))
  .use(csurf({ cookie: true }), middleware.csrfToken())
  .use(bodyParser.text());

// app routes
app.use('/', routers.home);
app.use('/pokedex', pokedexRouter.pokedex);

// app error handlers
app.use(middleware.notFound());
app.use(middleware.errorHandler());

export default app;
