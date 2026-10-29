import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Entites } from './entites';

describe('Entites', () => {
  let component: Entites;
  let fixture: ComponentFixture<Entites>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Entites]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Entites);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
