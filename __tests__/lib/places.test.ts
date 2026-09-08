import { photonFeatureToResult, type PhotonFeature } from '@/lib/places';

describe('photonFeatureToResult', () => {
  it('maps a feature with extent and country code', () => {
    const feature: PhotonFeature = {
      geometry: { coordinates: [18.06, 59.33] },
      properties: {
        osm_id: 2978650,
        name: 'Stockholm',
        city: 'Stockholm',
        country: 'Sweden',
        countrycode: 'se',
        extent: [17.8, 59.4, 18.2, 59.2],
      },
    };
    const result = photonFeatureToResult(feature);
    expect(result).toEqual({
      display_name: 'Stockholm, Sweden',
      place_id: 2978650,
      bounds: { west: 17.8, south: 59.2, east: 18.2, north: 59.4 },
      country_code: 'SE',
    });
  });

  it('pads a box around the point when extent is missing', () => {
    const feature: PhotonFeature = {
      geometry: { coordinates: [10, 60] },
      properties: {
        osm_id: 1,
        name: 'Somewhere',
        countrycode: 'NO',
      },
    };
    const result = photonFeatureToResult(feature);
    expect(result).toEqual({
      display_name: 'Somewhere',
      place_id: 1,
      bounds: { west: 9.95, south: 59.95, east: 10.05, north: 60.05 },
      country_code: 'NO',
    });
  });

  it('falls back to padded box when extent has bad numbers', () => {
    const feature: PhotonFeature = {
      geometry: { coordinates: [5, 50] },
      properties: {
        osm_id: 2,
        name: 'BadExtent',
        extent: ['x', 1, 2, 3],
      },
    };
    const result = photonFeatureToResult(feature);
    expect(result?.bounds).toEqual({
      west: 4.95,
      south: 49.95,
      east: 5.05,
      north: 50.05,
    });
  });

  it('returns null for missing osm_id or coordinates', () => {
    expect(
      photonFeatureToResult({
        geometry: { coordinates: [1, 2] },
        properties: { name: 'NoId' },
      })
    ).toBeNull();
    expect(
      photonFeatureToResult({
        geometry: { coordinates: [NaN, 2] },
        properties: { osm_id: 3, name: 'BadCoords' },
      })
    ).toBeNull();
    expect(photonFeatureToResult({ properties: { osm_id: 4 } })).toBeNull();
  });

  it('omits country_code when not a 2-letter code', () => {
    const result = photonFeatureToResult({
      geometry: { coordinates: [1, 2] },
      properties: { osm_id: 5, name: 'X', countrycode: 'SWE' },
    });
    expect(result?.country_code).toBeUndefined();
  });
});
