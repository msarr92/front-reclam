import { TestBed } from '@angular/core/testing';

import { TicketAnalytics } from './ticket-analytics';

describe('TicketAnalytics', () => {
  let service: TicketAnalytics;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TicketAnalytics);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
