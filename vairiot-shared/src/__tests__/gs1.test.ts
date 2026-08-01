import {
  buildGiai,
  buildIarServer,
  buildIarStandalone,
  canonicalise,
  chooseEpc,
  decodeGiai96,
  encodeGiai96,
  epcPureIdentityUri,
  epcTagUri,
  formatHri,
  gs1CheckDigit,
  gs1128ElementString,
  Gs1Error,
  iarAuthority,
  isInternalEpc,
  isValidIar,
  parseAssetScan,
  parseHri,
  permalockAllowed,
  assetDigitalLink,
  tid96Epc,
  toGtin14,
} from '../index.js';

// ── Spec §3.4 test vectors — normative, MUST pass ────────────────────────────

const VECTORS = {
  serverAllocated: {
    sequence: 12345,
    iar: '100000123454',
    authority: 'SERVER',
    hri: '1 00000 12345 4',
  },
  standaloneAllocated: {
    workspace: 7,
    sequence: 12345,
    iar: '207000123450',
    authority: 'STANDALONE',
    hri: '2 07000 12345 0',
  },
  gs1Mode: {
    companyPrefix: '9521141',
    iar: '100000123454',
    giai: '9521141100000123454',
    partition: 5,
    filterValue: 0,
    epcHex: '3416451FD40000174878CA3E',
    tagUri: 'urn:epc:tag:giai-96:0.9521141.100000123454',
    pureIdentityUri: 'urn:epc:id:giai:9521141.100000123454',
    elementString: '(8004)9521141100000123454',
  },
  internalMode: {
    tenantSlug: 'acme-fm',
    iar: '100000123454',
    tidHex: 'E280699500005012345678AB',
    epcHex: 'E280699500005012345678AB',
    scheme: 'TID96',
    digitalLink: 'https://id.vairiot.com/t/acme-fm/asset/100000123454',
    elementString: '(91)100000123454',
  },
};

describe('check digit', () => {
  const CHECK_DIGIT_VECTORS = [
    { body: '629104150002', check: 2 }, // GTIN-13 -> 6291041500022
    { body: '400638133393', check: 1 }, // EAN-13  -> 4006381333931
    { body: '10000012345', check: 4 }, // server IAR body
    { body: '20700012345', check: 0 }, // standalone IAR body
  ];
  it.each(CHECK_DIGIT_VECTORS)('gs1CheckDigit($body) = $check', ({ body, check }) => {
    expect(gs1CheckDigit(body)).toBe(check);
  });
  it('rejects non-numeric bodies', () => {
    expect(() => gs1CheckDigit('12a4')).toThrow(Gs1Error);
  });
});

describe('IAR construction', () => {
  it('builds the server vector', () => {
    const v = VECTORS.serverAllocated;
    expect(buildIarServer(v.sequence)).toBe(v.iar);
    expect(isValidIar(v.iar)).toBe(true);
    expect(iarAuthority(v.iar)).toBe(v.authority);
    expect(formatHri(v.iar)).toBe(v.hri);
    expect(parseHri(v.hri)).toBe(v.iar);
  });
  it('builds the standalone vector', () => {
    const v = VECTORS.standaloneAllocated;
    expect(buildIarStandalone(v.workspace, v.sequence)).toBe(v.iar);
    expect(iarAuthority(v.iar)).toBe(v.authority);
    expect(formatHri(v.iar)).toBe(v.hri);
  });
  it('formats HRI with a tenant mark', () => {
    expect(formatHri('100000123454', 'ACME')).toBe('ACME 1 00000 12345 4');
  });
  it('rejects out-of-range sequences and workspaces', () => {
    expect(() => buildIarServer(0)).toThrow('SEQUENCE_OUT_OF_RANGE');
    expect(() => buildIarServer(10 ** 10)).toThrow('SEQUENCE_OUT_OF_RANGE');
    expect(() => buildIarStandalone(0, 1)).toThrow('WORKSPACE_OUT_OF_RANGE');
    expect(() => buildIarStandalone(100, 1)).toThrow('WORKSPACE_OUT_OF_RANGE');
    expect(() => buildIarStandalone(1, 10 ** 8)).toThrow('SEQUENCE_OUT_OF_RANGE');
  });
  it('rejects a tampered check digit', () => {
    expect(isValidIar('100000123455')).toBe(false);
    expect(isValidIar('300000123454')).toBe(false); // unknown marker
    expect(() => parseHri('1 00000 12345 5')).toThrow('BAD_IAR');
  });
});

describe('GIAI', () => {
  it('concatenates prefix + IAR', () => {
    const v = VECTORS.gs1Mode;
    expect(buildGiai(v.companyPrefix, v.iar)).toBe(v.giai);
  });
  it('must-throw vectors', () => {
    expect(() => buildGiai('952114110', 'x00000123454')).toThrow('BAD_IAR');
    expect(() => buildGiai('95211', '100000123454')).toThrow('BAD_COMPANY_PREFIX');
  });
});

describe('GIAI-96 EPC', () => {
  const v = VECTORS.gs1Mode;
  it('encodes the spec vector', () => {
    expect(encodeGiai96(v.companyPrefix, v.iar, v.filterValue)).toBe(v.epcHex);
  });
  it('decodes the spec vector', () => {
    expect(decodeGiai96(v.epcHex)).toEqual({
      filterValue: 0,
      partition: 5,
      companyPrefix: v.companyPrefix,
      individualAssetReference: v.iar,
    });
  });
  it('produces the URI forms', () => {
    expect(epcTagUri(v.companyPrefix, v.iar, 0)).toBe(v.tagUri);
    expect(epcPureIdentityUri(v.companyPrefix, v.iar)).toBe(v.pureIdentityUri);
  });
  it('must-throw vectors', () => {
    expect(() => encodeGiai96('9521141', '000000123454')).toThrow('GIAI96_LEADING_ZERO');
    expect(() => encodeGiai96('95211', '100000123454')).toThrow('BAD_COMPANY_PREFIX_LENGTH');
    expect(() => encodeGiai96('9521141234567', '100000123454')).toThrow(
      'BAD_COMPANY_PREFIX_LENGTH',
    );
  });
  it('round-trips sampled sequences', () => {
    for (let i = 0; i < 2000; i++) {
      const seq = 1 + ((i * 4999999) % (10 ** 10 - 1));
      const iar = buildIarServer(seq);
      const decoded = decodeGiai96(encodeGiai96(v.companyPrefix, iar));
      expect(decoded.companyPrefix).toBe(v.companyPrefix);
      expect(decoded.individualAssetReference).toBe(iar);
    }
  });
  it('standalone IARs always start with 2 and are valid', () => {
    for (const workspace of [1, 7, 42, 99]) {
      for (const seq of [1, 12345, 10 ** 8 - 1]) {
        const iar = buildIarStandalone(workspace, seq);
        expect(iar[0]).toBe('2');
        expect(isValidIar(iar)).toBe(true);
        expect(iarAuthority(iar)).toBe('STANDALONE');
      }
    }
  });
});

describe('TID-96 internal EPC', () => {
  const v = VECTORS.internalMode;
  it('accepts a serialised TID', () => {
    expect(tid96Epc(v.tidHex)).toBe(v.epcHex);
    expect(isInternalEpc(v.epcHex)).toBe(true);
  });
  it('must-throw vectors', () => {
    expect(() => tid96Epc('E1806995000050123456')).toThrow('TID_TOO_SHORT');
    expect(() => tid96Epc('E080699500005012345678AB')).toThrow('TID_NOT_SERIALISED');
  });
  it('chooseEpc selects by tenant mode', () => {
    expect(
      chooseEpc({ mode: 'GS1', companyPrefix: '9521141', iar: v.iar, tidHex: v.tidHex }),
    ).toEqual({ epcHex: VECTORS.gs1Mode.epcHex, scheme: 'GIAI96' });
    expect(chooseEpc({ mode: 'INTERNAL', iar: v.iar, tidHex: v.tidHex })).toEqual({
      epcHex: v.epcHex,
      scheme: 'TID96',
    });
    expect(() => chooseEpc({ mode: 'GS1', iar: v.iar, tidHex: v.tidHex })).toThrow(
      'GS1_MODE_WITHOUT_PREFIX',
    );
  });
});

describe('GTIN', () => {
  it('normalises to GTIN-14', () => {
    expect(toGtin14('6291041500022')).toBe('06291041500022');
  });
  it('rejects a bad check digit', () => {
    expect(() => toGtin14('6291041500029')).toThrow('GTIN_CHECK_DIGIT');
  });
});

describe('Digital Link', () => {
  it('builds GS1-mode and INTERNAL-mode URIs', () => {
    const g = VECTORS.gs1Mode;
    expect(
      assetDigitalLink({ mode: 'GS1', giai: g.giai, iar: g.iar, tenantSlug: 'acme-fm' }),
    ).toBe(`https://id.vairiot.com/8004/${g.giai}`);
    const i = VECTORS.internalMode;
    expect(
      assetDigitalLink({ mode: 'INTERNAL', iar: i.iar, tenantSlug: i.tenantSlug }),
    ).toBe(i.digitalLink);
  });
  it('canonicalises to id.gs1.org with sorted AI params only', () => {
    expect(
      canonicalise('https://id.vairiot.com/8004/9521141100000123454/?linkType=all&21=X&01=1'),
    ).toBe('https://id.gs1.org/8004/9521141100000123454?01=1&21=X');
    expect(() => canonicalise(VECTORS.internalMode.digitalLink)).toThrow('NOT_CANONICALISABLE');
  });
  it('parseAssetScan resolves raw IAR, GS1 path and tenant path', () => {
    expect(parseAssetScan('100000123454')).toEqual({ iar: '100000123454' });
    expect(parseAssetScan('https://id.vairiot.com/8004/9521141100000123454')).toEqual({
      giai: '9521141100000123454',
    });
    expect(parseAssetScan(VECTORS.internalMode.digitalLink)).toEqual({
      iar: '100000123454',
      tenantSlug: 'acme-fm',
    });
    expect(parseAssetScan('not a url')).toBeNull();
    expect(parseAssetScan('https://id.vairiot.com/t/acme-fm/asset/100000123455')).toBeNull();
  });
  it('element strings by mode', () => {
    expect(gs1128ElementString({ mode: 'GS1', giai: VECTORS.gs1Mode.giai, iar: '' })).toBe(
      VECTORS.gs1Mode.elementString,
    );
    expect(gs1128ElementString({ mode: 'INTERNAL', iar: '100000123454' })).toBe(
      VECTORS.internalMode.elementString,
    );
  });
});

describe('permalock gate', () => {
  const base = {
    mode: 'GS1' as const,
    allowInternalPermalock: false,
    epcScheme: 'GIAI96' as const,
    verifiedAt: '2026-01-01T00:00:00Z',
    settlingPeriodDays: 90,
    assetStatus: 'ACTIVE',
    now: new Date('2026-07-01T00:00:00Z'),
  };
  it('allows GS1 + GIAI96 after settling', () => {
    expect(permalockAllowed(base)).toEqual({ allowed: true });
  });
  it('always refuses INTERNAL mode without opt-in', () => {
    for (const epcScheme of ['GIAI96', 'GIAI202', 'TID96'] as const) {
      expect(
        permalockAllowed({ ...base, mode: 'INTERNAL', allowInternalPermalock: false, epcScheme })
          .allowed,
      ).toBe(false);
    }
  });
  it('refuses every non-GIAI96 scheme in GS1 mode', () => {
    for (const epcScheme of ['GIAI202', 'TID96'] as const) {
      expect(permalockAllowed({ ...base, epcScheme }).allowed).toBe(false);
    }
  });
  it('refuses unverified tags, settling period, and disposed/lost assets', () => {
    expect(permalockAllowed({ ...base, verifiedAt: null }).allowed).toBe(false);
    expect(
      permalockAllowed({ ...base, now: new Date('2026-01-15T00:00:00Z') }).allowed,
    ).toBe(false);
    expect(permalockAllowed({ ...base, assetStatus: 'DISPOSED' }).allowed).toBe(false);
    expect(permalockAllowed({ ...base, assetStatus: 'disposed' }).allowed).toBe(false);
    expect(permalockAllowed({ ...base, assetStatus: 'LOST' }).allowed).toBe(false);
  });
});
