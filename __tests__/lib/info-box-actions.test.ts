import {
  dispatchLightboxFromPhoto,
  dispatchSaveFromButton,
  eventTargetElement,
  findInfoBoxInteractiveTarget,
  parseLightboxDetailFromPhoto,
  parseSaveDetailFromButton,
} from '@/components/globe/info-box-actions';
import {
  LIGHTBOX_EVENT,
  LIGHTBOX_PHOTO_CLASS,
  SAVE_BUTTON_CLASS,
  SAVE_OCCURRENCE_EVENT,
} from '@/components/globe/constants';

describe('info-box-actions', () => {
  describe('eventTargetElement', () => {
    it('returns Element targets directly', () => {
      const el = document.createElement('button');
      expect(eventTargetElement(el)).toBe(el);
    });

    it('resolves text-node targets to their parent element', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Save';
      const text = btn.firstChild;
      expect(text).toBeTruthy();
      expect(eventTargetElement(text)).toBe(btn);
    });
  });

  describe('parseLightboxDetailFromPhoto', () => {
    it('reads multi-url gallery from data attributes', () => {
      const btn = document.createElement('button');
      btn.className = LIGHTBOX_PHOTO_CLASS;
      btn.setAttribute(
        'data-allurls',
        JSON.stringify(['https://a.example/1.jpg', 'https://a.example/2.jpg'])
      );
      btn.setAttribute('data-index', '1');
      btn.setAttribute('data-fullurl', 'https://a.example/2.jpg');
      expect(parseLightboxDetailFromPhoto(btn)).toEqual({
        urls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'],
        index: 1,
      });
    });

    it('falls back to img src when data-fullurl is missing', () => {
      const wrap = document.createElement('button');
      wrap.className = LIGHTBOX_PHOTO_CLASS;
      const img = document.createElement('img');
      img.src = 'https://cdn.example/photo.jpg';
      wrap.appendChild(img);
      expect(parseLightboxDetailFromPhoto(wrap)).toEqual({
        url: 'https://cdn.example/photo.jpg',
      });
    });

    it('returns null when no URL is available', () => {
      expect(parseLightboxDetailFromPhoto(document.createElement('button'))).toBeNull();
    });

    it('falls back to single URL when allurls JSON is invalid', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-fullurl', 'https://ok.example/a.jpg');
      btn.setAttribute('data-allurls', '{not-json');
      btn.setAttribute('data-index', '0');
      expect(parseLightboxDetailFromPhoto(btn)).toEqual({ url: 'https://ok.example/a.jpg' });
    });
    it('reads attributes after HTML-escaped innerHTML injection (Cesium path)', () => {
      const urls = ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'];
      const escaped = JSON.stringify(urls)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const host = document.createElement('div');
      host.innerHTML = `<button type="button" class="${LIGHTBOX_PHOTO_CLASS}" data-fullurl="https://cdn.example/b.jpg" data-allurls="${escaped}" data-index="1"><img alt="" /></button>`;
      const photo = host.querySelector('button')!;
      expect(parseLightboxDetailFromPhoto(photo)).toEqual({ urls, index: 1 });
    });
  });

  describe('parseSaveDetailFromButton', () => {
    it('parses add/remove actions', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-key', '42');
      btn.setAttribute('data-action', 'add');
      expect(parseSaveDetailFromButton(btn)).toEqual({ key: 42, action: 'add' });

      btn.setAttribute('data-action', 'remove');
      expect(parseSaveDetailFromButton(btn)).toEqual({ key: 42, action: 'remove' });
    });

    it('rejects invalid key or action', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-key', 'x');
      btn.setAttribute('data-action', 'add');
      expect(parseSaveDetailFromButton(btn)).toBeNull();

      btn.setAttribute('data-key', '7');
      btn.setAttribute('data-action', 'maybe');
      expect(parseSaveDetailFromButton(btn)).toBeNull();
    });
  });

  describe('findInfoBoxInteractiveTarget', () => {
    it('finds photo, save, and link from nested targets', () => {
      const root = document.createElement('div');
      root.innerHTML = `
        <button class="${LIGHTBOX_PHOTO_CLASS}" type="button"><img alt="" /></button>
        <button class="${SAVE_BUTTON_CLASS}" type="button">Save</button>
        <a href="https://www.gbif.org/occurrence/1">View</a>
      `;
      const img = root.querySelector('img')!;
      const saveText = root.querySelector(`.${SAVE_BUTTON_CLASS}`)!;
      const link = root.querySelector('a')!;

      expect(findInfoBoxInteractiveTarget(img).photo).toBeTruthy();
      expect(findInfoBoxInteractiveTarget(saveText).saveBtn).toBeTruthy();
      expect(findInfoBoxInteractiveTarget(link).link?.href).toContain('gbif.org');
    });
  });

  describe('dispatch helpers', () => {
    it('dispatches lightbox and save custom events on window', () => {
      const lightbox = jest.fn();
      const save = jest.fn();
      window.addEventListener(LIGHTBOX_EVENT, lightbox);
      window.addEventListener(SAVE_OCCURRENCE_EVENT, save);

      const photo = document.createElement('button');
      photo.setAttribute('data-fullurl', 'https://cdn.example/p.jpg');
      expect(dispatchLightboxFromPhoto(photo)).toBe(true);
      expect(lightbox).toHaveBeenCalled();
      expect((lightbox.mock.calls[0][0] as CustomEvent).detail).toEqual({
        url: 'https://cdn.example/p.jpg',
      });

      const btn = document.createElement('button');
      btn.setAttribute('data-key', '99');
      btn.setAttribute('data-action', 'add');
      expect(dispatchSaveFromButton(btn)).toBe(true);
      expect(save).toHaveBeenCalled();
      expect((save.mock.calls[0][0] as CustomEvent).detail).toEqual({
        key: 99,
        action: 'add',
      });

      window.removeEventListener(LIGHTBOX_EVENT, lightbox);
      window.removeEventListener(SAVE_OCCURRENCE_EVENT, save);
    });
  });
});
