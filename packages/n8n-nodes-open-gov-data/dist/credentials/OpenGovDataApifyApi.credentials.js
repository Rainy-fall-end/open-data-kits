'use strict';

class OpenGovDataApifyApi {
  constructor() {
    this.name = 'openGovDataApifyApi';
    this.displayName = 'Open Gov Data: Apify API';
    this.documentationUrl = 'https://docs.apify.com/platform/integrations/api';
    this.properties = [
      {
        displayName: 'API Token',
        name: 'token',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description: 'Apify personal API token. It is sent only in the Authorization header and is never logged.',
      },
    ];
  }
}

module.exports = { OpenGovDataApifyApi };
