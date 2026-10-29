import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Rapport } from './rapport';

describe('Rapport', () => {
  let component: Rapport;
  let fixture: ComponentFixture<Rapport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Rapport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Rapport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
