import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      name: 'VenueFlow API',
      version: '1.0.0',
      docs: '/docs',
    };
  }
}
