'use strict';

class OpenGovDataRapidApi {
  constructor() {
    this.name = 'openGovDataRapidApi';
    this.displayName = 'Open Gov Data: RapidAPI';
    this.documentationUrl = 'https://docs.rapidapi.com/docs/keys-and-key-rotation';
    this.properties = [
      {
        displayName: 'RapidAPI Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description: 'RapidAPI application key. It is sent only in X-RapidAPI-Key and is never logged.',
      },
    ];
  }
}

module.exports = { OpenGovDataRapidApi };
