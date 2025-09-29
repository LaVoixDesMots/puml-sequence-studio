import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExampleGalleryComponent } from './example-gallery.component';

describe('ExampleGalleryComponent', () => {
  let component: ExampleGalleryComponent;
  let fixture: ComponentFixture<ExampleGalleryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExampleGalleryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExampleGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
