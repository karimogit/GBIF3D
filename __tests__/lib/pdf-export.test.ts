import type { GBIFOccurrence } from '@/types/gbif';

jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    setFillColor: jest.fn(),
    rect: jest.fn(),
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    text: jest.fn(),
    setDrawColor: jest.fn(),
    line: jest.fn(),
    splitTextToSize: jest.fn((text: string) => [text]),
    addImage: jest.fn(),
    addPage: jest.fn(),
    getTextWidth: jest.fn(() => 20),
    textWithLink: jest.fn(),
    getCurrentPageInfo: jest.fn(() => ({ pageNumber: 1 })),
    save: jest.fn(),
  })),
}));

jest.mock('jspdf-autotable', () => jest.fn());

import autoTable from 'jspdf-autotable';
import { generateOccurrencePdf } from '@/lib/pdf-export';

describe('generateOccurrencePdf', () => {
  it('uses a wider Count column and a simplified species table', () => {
    const occurrences: GBIFOccurrence[] = [
      {
        key: 1,
        scientificName: 'Apis mellifera',
        vernacularName: 'Western honey bee',
        decimalLatitude: 59.3,
        decimalLongitude: 18.0,
        year: 2020,
        country: 'Sweden',
        countryCode: 'SE',
        iucnRedListCategory: 'LC',
      },
      {
        key: 2,
        scientificName: 'Apis mellifera',
        vernacularName: 'Western honey bee',
        decimalLatitude: 59.4,
        decimalLongitude: 18.1,
        year: 2021,
        country: 'Sweden',
        countryCode: 'SE',
        iucnRedListCategory: 'LC',
      },
    ];

    generateOccurrencePdf({
      occurrences,
      filters: {
        selectedSpeciesOptions: [{ key: 1341976, label: 'Western honey bee (Apis mellifera)' }],
        taxonKeys: [1341976],
      },
      regionName: 'Sweden',
    });

    expect(autoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [['Scientific name', 'Common name', 'Count', 'IUCN status', 'Years', 'Countries']],
        columnStyles: expect.objectContaining({
          2: expect.objectContaining({ cellWidth: 16, halign: 'right' }),
        }),
        body: expect.arrayContaining([
          expect.arrayContaining(['Apis mellifera', 'Western honey bee', '2']),
        ]),
      })
    );
  });
});
