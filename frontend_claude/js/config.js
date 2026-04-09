//
// basePath: subfolder the frontend is served from.
//   Production:  basePath: ''
//   Test:        basePath: '/test'
window._config = {
  basePath: '/test',
  cognito: {
	userPoolId: 'us-east-1_F1f5MVHZp',
	userPoolClientId: '5n04ooefut2ig99c53me8l0qeq',
    region: 'us-east-1',
  },
  api: {
    url: 'https://api.bunch-o-taylors.com/test',
  },
  s3: {
    bucket: 'bunch-o-taylors',
    url: 'https://bunch-o-taylors.s3.amazonaws.com',
  },
};