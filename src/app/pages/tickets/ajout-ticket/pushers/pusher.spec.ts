import { TestBed } from '@angular/core/testing';

import { Pusher } from './pusher';

describe('Pusher', () => {
  let service: Pusher;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Pusher);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
