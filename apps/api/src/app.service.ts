import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      name: 'GoSpots API',
      version: '1.0.0',
      docs: '/docs',
    };
  }
}
