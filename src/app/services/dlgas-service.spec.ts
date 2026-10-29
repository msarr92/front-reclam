import { TestBed } from '@angular/core/testing';

import { DlgasService } from './dlgas-service';

describe('DlgasService', () => {
  let service: DlgasService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DlgasService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
