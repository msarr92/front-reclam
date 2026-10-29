import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Dlgas } from './dlgas';

describe('Dlgas', () => {
  let component: Dlgas;
  let fixture: ComponentFixture<Dlgas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dlgas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Dlgas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
