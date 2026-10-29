import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AjoutTicket } from './ajout-ticket';

describe('AjoutTicket', () => {
  let component: AjoutTicket;
  let fixture: ComponentFixture<AjoutTicket>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AjoutTicket]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AjoutTicket);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
