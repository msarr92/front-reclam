import { TestBed } from '@angular/core/testing';

import { DashboardServices } from './dashboard-services';

describe('DashboardServices', () => {
  let service: DashboardServices;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardServices);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
