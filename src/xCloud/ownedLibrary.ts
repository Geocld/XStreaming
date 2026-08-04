import axios from 'axios';
import {NativeModules} from 'react-native';
import {debugFactory} from '../utils/debug';
import Xal from '../xal';
import Msal from '../xal/msal';
import TokenStore from '../xal/tokenstore';

const log = debugFactory('xCloud/ownedLibrary.ts');

const COLLECTIONS_HOST = 'collections.mp.microsoft.com';
const B2B_LICENSE_PREVIEW_URL = `https://${COLLECTIONS_HOST}/v8.0/collections/b2bLicensePreview`;
const COLLECTIONS_RELYING_PARTY = 'http://licensing.xboxlive.com';

interface XalManagerModule {
  init?: () => void;
  sign?: (url: string, authorizationToken: string, postData: string) => string;
}

const {XalManager} = NativeModules as {XalManager?: XalManagerModule};

type OwnedLibraryOptions = {
  maxPageSize?: number;
  productIds?: string[];
};

type ProductSkuId = {
  productId: string;
};

const OWNED_LIBRARY_ENTITLEMENT_FILTERS = [
  '*:Game',
  '*:Consumable',
  '*:UnmanagedConsumable',
  '*:Durable',
  '*:Pass',
];

const PRODUCT_SKU_ID_CHUNK_SIZE = 100;

const getXblAuthorization = (tokenData: any) => {
  const data = tokenData?.data ?? tokenData;
  const uhs = data?.DisplayClaims?.xui?.[0]?.uhs;
  const token = data?.Token;
  if (!uhs || !token) {
    return '';
  }
  return `XBL3.0 x=${uhs};${token}`;
};

const getCollectionsAuthorization = async () => {
  const tokenStore = new TokenStore();
  tokenStore.load();

  const authMethod = tokenStore.getAuthenticationMethod();
  const userToken = tokenStore.getUserToken();
  const sisuToken = tokenStore.getSisuToken();
  console.log(
    '[OwnedLibrary] collections token request:',
    `authMethod=${authMethod} relyingParty=${COLLECTIONS_RELYING_PARTY}`,
  );

  if (userToken) {
    try {
      if (userToken.getSecondsValid() <= 60) {
        if (sisuToken) {
          await new Xal().refreshTokens(tokenStore);
        } else {
          await new Msal(tokenStore).refreshUserToken();
        }
      }

      const msal = new Msal(tokenStore);
      const xstsAuthToken = await msal.doXstsAuthentication();
      const xstsTokenValue = xstsAuthToken.data.Token;
      if (!xstsTokenValue) {
        throw new Error(
          'Missing web/RPS XSTS auth token for owned library request',
        );
      }
      const collectionsToken = await msal.doXstsAuthorization(
        xstsTokenValue,
        COLLECTIONS_RELYING_PARTY,
      );
      const authorization = getXblAuthorization(collectionsToken);
      if (!authorization) {
        throw new Error('Missing web/RPS collections authorization token');
      }
      console.log(
        '[OwnedLibrary] collections token ready:',
        `source=web-rps relyingParty=${COLLECTIONS_RELYING_PARTY}`,
      );
      return authorization;
    } catch (error) {
      console.log('[OwnedLibrary] web-rps collections token failed:', error);
    }
  }

  if (sisuToken) {
    const xal = new Xal();
    const activeSisuToken =
      sisuToken.getSecondsValid() > 60
        ? sisuToken
        : (await xal.refreshTokens(tokenStore)).sisuToken;
    const collectionsToken = await xal.doXstsAuthorization(
      activeSisuToken,
      COLLECTIONS_RELYING_PARTY,
    );
    const authorization = getXblAuthorization(collectionsToken);
    if (!authorization) {
      throw new Error('Missing XAL collections authorization token');
    }
    console.log(
      '[OwnedLibrary] collections token ready:',
      `source=xal relyingParty=${COLLECTIONS_RELYING_PARTY}`,
    );
    return authorization;
  }

  throw new Error(
    `Missing auth token for owned library request, authMethod=${authMethod}`,
  );
};

const signCollectionsRequest = (authorization: string, body: string) => {
  if (!XalManager?.sign) {
    throw new Error('Missing XalManager.sign for owned library request');
  }
  XalManager.init?.();
  return XalManager.sign(B2B_LICENSE_PREVIEW_URL, authorization, body);
};

const getOwnedLibraryPage = async (
  authorization: string,
  productSkuIds: ProductSkuId[],
  continuationToken?: string,
  options: OwnedLibraryOptions = {},
) => {
  const body: any = {
    maxPageSize: options.maxPageSize ?? 100,
    excludeDuplicates: true,
    expandSatisfyingItems: true,
    market: 'neutral',
    entitlementFilters: OWNED_LIBRARY_ENTITLEMENT_FILTERS,
  };

  if (productSkuIds.length > 0) {
    body.productSkuIds = productSkuIds;
  }

  if (continuationToken) {
    body.continuationToken = continuationToken;
  }

  const bodyString = JSON.stringify(body);
  const signature = signCollectionsRequest(authorization, bodyString);

  console.log(
    '[OwnedLibrary] request page:',
    `url=${B2B_LICENSE_PREVIEW_URL} bodyLen=${
      bodyString.length
    } productSkuIds=${productSkuIds.length} continuation=${Boolean(
      continuationToken,
    )} filters=${OWNED_LIBRARY_ENTITLEMENT_FILTERS.join(',')}`,
  );

  const response = await axios.post(B2B_LICENSE_PREVIEW_URL, bodyString, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: authorization,
      Signature: signature,
      Host: COLLECTIONS_HOST,
      'Content-Length': bodyString.length.toString(),
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    },
    timeout: 30 * 1000,
  });

  return response.data;
};

export const logOwnedLibraryError = (error: any) => {
  if (axios.isAxiosError(error)) {
    console.log('[OwnedLibrary] request error url:', error.config?.url);
    console.log('[OwnedLibrary] request error method:', error.config?.method);
    console.log('[OwnedLibrary] request error status:', error.response?.status);
    console.log(
      '[OwnedLibrary] request error response:',
      JSON.stringify(error.response?.data),
    );
    return;
  }
  console.log('[OwnedLibrary] request error:', error);
};

const toProductSkuIds = (productIds: string[] = []) => {
  const seen = new Set<string>();
  const productSkuIds: ProductSkuId[] = [];

  productIds.forEach(productId => {
    const normalizedProductId =
      typeof productId === 'string' ? productId.trim().toUpperCase() : '';
    if (!normalizedProductId || seen.has(normalizedProductId)) {
      return;
    }
    seen.add(normalizedProductId);
    productSkuIds.push({productId: normalizedProductId});
  });

  return productSkuIds;
};

export const fetchOwnedLibraryPreview = async (
  _webToken: any,
  options: OwnedLibraryOptions = {},
) => {
  const pages: any[] = [];
  const authorization = await getCollectionsAuthorization();
  const productSkuIds = toProductSkuIds(options.productIds);
  const chunks =
    productSkuIds.length > 0
      ? Array.from(
          {length: Math.ceil(productSkuIds.length / PRODUCT_SKU_ID_CHUNK_SIZE)},
          (_, index) =>
            productSkuIds.slice(
              index * PRODUCT_SKU_ID_CHUNK_SIZE,
              (index + 1) * PRODUCT_SKU_ID_CHUNK_SIZE,
            ),
        )
      : [[]];

  console.log(
    '[OwnedLibrary] request products:',
    `productSkuIds=${productSkuIds.length} chunks=${chunks.length}`,
  );

  for (const chunk of chunks) {
    let continuationToken: string | undefined;
    do {
      const page = await getOwnedLibraryPage(
        authorization,
        chunk,
        continuationToken,
        options,
      );
      pages.push(page);
      console.log(
        '[OwnedLibrary] b2bLicensePreview page response:',
        JSON.stringify(page),
      );
      continuationToken = page?.continuationToken;
    } while (continuationToken);
  }

  log.info('[OwnedLibrary] b2bLicensePreview completed pages:', pages.length);
  return pages;
};
