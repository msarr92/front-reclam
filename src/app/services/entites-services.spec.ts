import { TestBed } from '@angular/core/testing';

import { EntitesServices } from './entites-services';

describe('EntitesServices', () => {
  let service: EntitesServices;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EntitesServices);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
