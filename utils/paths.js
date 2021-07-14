import path from 'path';

const root = path.resolve(process.cwd());
const paths = {
  root,
  app: `${root}/app`,
  assets: `${root}/assets`,
  public: `${root}/public`,
  storage: `${root}/storage`,
  utils: `${root}/utils`
};

export default paths;
