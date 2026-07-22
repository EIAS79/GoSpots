import { MediaService } from './media.service';

jest.mock('../../common/image-media.util', () => {
  const actual = jest.requireActual('../../common/image-media.util') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    compressImageForStorage: jest.fn().mockResolvedValue({
      mime: 'image/webp',
      encoding: 'raw',
      width: 1,
      height: 1,
      byteSize: 4,
      data: Buffer.from([1, 2, 3, 4]),
    }),
  };
});

/** Minimal valid 1×1 PNG (matches image-media.util.spec). */
function png1x1(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

describe('MediaService tenant-scoped mutations', () => {
  const shopAId = 'clmedia_shop_a_001';
  const shopBId = 'clmedia_shop_b_001';
  const oldId = 'clmedia_shop_a_old';

  const pngFile = {
    buffer: png1x1(),
    size: png1x1().length,
    mimetype: 'image/png',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new MediaService(prisma as never);
  }

  it('storeFromUpload creates StoredImage with actor shopId', async () => {
    const create = jest.fn().mockResolvedValue({ id: shopAId });
    const service = makeService({
      storedImage: { create },
    });

    const path = await service.storeFromUpload('shop_a', pngFile as never);

    expect(path).toBe(`/media/${shopAId}`);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: 'shop_a' }),
      }),
    );
  });

  it('deleteByMediaPath scopes deleteMany to id + shopId', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService({
      storedImage: { deleteMany },
    });

    await service.deleteByMediaPath('shop_a', `/media/${shopAId}`);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: shopAId, shopId: 'shop_a' },
    });
  });

  it('deleteByMediaPath does not delete Shop B media when called as Shop A', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = makeService({
      storedImage: { deleteMany },
    });

    await service.deleteByMediaPath('shop_a', `/media/${shopBId}`);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: shopBId, shopId: 'shop_a' },
    });
    expect(deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: 'shop_b' }),
      }),
    );
    expect(deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: shopBId },
      }),
    );
  });

  it('replaceMediaPath stores under shopId and deletes old path with same shopId', async () => {
    const create = jest.fn().mockResolvedValue({ id: shopAId });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService({
      storedImage: { create, deleteMany },
    });

    const next = await service.replaceMediaPath(
      'shop_a',
      `/media/${oldId}`,
      pngFile as never,
    );

    expect(next).toBe(`/media/${shopAId}`);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: 'shop_a' }),
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: oldId, shopId: 'shop_a' },
    });
  });

  it('replaceMediaPath scopes Shop B old-path cleanup to Shop A shopId', async () => {
    const create = jest.fn().mockResolvedValue({ id: shopAId });
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = makeService({
      storedImage: { create, deleteMany },
    });

    await service.replaceMediaPath(
      'shop_a',
      `/media/${shopBId}`,
      pngFile as never,
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: shopBId, shopId: 'shop_a' },
    });
    expect(deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: shopBId },
      }),
    );
  });
});
