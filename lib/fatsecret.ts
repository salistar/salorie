import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

const CLIENT_ID = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_ID || '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_SECRET || '';

const TOKEN_KEY = 'fatsecret_token';
const EXPIRY_KEY = 'fatsecret_token_expiry';

/**
 * Fetches a new OAuth 2.0 access token from FatSecret
 */
async function fetchNewToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('FatSecret credentials not configured');
    return null;
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    console.log('\x1b[32m[API→FatSecret] /connect/token REQUEST\x1b[0m', {
      url: 'https://oauth.fatsecret.com/connect/token',
      method: 'POST',
      body: 'grant_type=client_credentials&scope=basic',
      clientId: CLIENT_ID ? `${CLIENT_ID.slice(0, 6)}…` : '(missing)',
    });
    const t0 = Date.now();
    const response = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=basic',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('\x1b[34m[API←FatSecret] /connect/token ERROR\x1b[0m', {
        ms: Date.now() - t0,
        status: response.status,
        body: errorText,
      });
      return null;
    }

    const data = await response.json();
    console.log('\x1b[34m[API←FatSecret] /connect/token RESPONSE\x1b[0m', {
      ms: Date.now() - t0,
      status: response.status,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      tokenPreview: data.access_token ? `${data.access_token.slice(0, 12)}…` : null,
    });
    if (data.access_token) {
      // Cache token with expiry (subtract 60s buffer)
      const expiry = Date.now() + ((data.expires_in - 60) * 1000);
      await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
      await AsyncStorage.setItem(EXPIRY_KEY, expiry.toString());
      return data.access_token;
    }
  } catch (error) {
    console.warn('\x1b[34m[API←FatSecret] /connect/token THROWN:\x1b[0m', error);
  }
  return null;
}

/**
 * Returns a valid access token, refreshing if necessary
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const expiry = await AsyncStorage.getItem(EXPIRY_KEY);

    if (token && expiry && Date.now() < parseInt(expiry)) {
      return token;
    }
  } catch {}

  return await fetchNewToken();
}

/**
 * Searches for food items using FatSecret REST API v2
 */
export async function searchFood(query: string): Promise<any[]> {
  if (query.length < 3) return [];

  const token = await getAccessToken();
  if (!token) {
    console.warn('No FatSecret token available');
    return [];
  }

  try {
    const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json&max_results=5`;

    console.log('\x1b[32m[API→FatSecret] foods.search REQUEST\x1b[0m', {
      url,
      method: 'GET',
      query,
      maxResults: 5,
    });
    const t0 = Date.now();
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('\x1b[34m[API←FatSecret] foods.search ERROR\x1b[0m', {
        ms: Date.now() - t0,
        status: response.status,
        body: errorText,
      });
      // If 401, token might be expired — clear cache and retry once
      if (response.status === 401) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(EXPIRY_KEY);
        const newToken = await fetchNewToken();
        if (newToken) {
          console.log('\x1b[32m[API→FatSecret] foods.search RETRY after 401 refresh\x1b[0m');
          const retryResponse = await fetch(url, {
            headers: { 'Authorization': `Bearer ${newToken}` },
          });
          const retryData = await retryResponse.json();
          const foods = retryData.foods?.food || [];
          console.log('\x1b[34m[API←FatSecret] foods.search RETRY RESPONSE\x1b[0m', {
            status: retryResponse.status,
            resultCount: Array.isArray(foods) ? foods.length : (foods ? 1 : 0),
          });
          return Array.isArray(foods) ? foods : [foods];
        }
      }
      return [];
    }

    const data = await response.json();
    const foods = data.foods?.food || [];
    const arr = Array.isArray(foods) ? foods : [foods];
    console.log('\x1b[34m[API←FatSecret] foods.search RESPONSE\x1b[0m', {
      ms: Date.now() - t0,
      status: response.status,
      query,
      resultCount: arr.length,
      preview: arr.slice(0, 3).map((f: any) => ({
        name: f?.food_name,
        id: f?.food_id,
        brand: f?.brand_name,
      })),
    });
    return arr;
  } catch (error) {
    console.warn('\x1b[34m[API←FatSecret] foods.search THROWN:\x1b[0m', error);
    return [];
  }
}
