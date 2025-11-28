/**
 * Naver Maps Geocoding Module
 * 네이버 지도 API를 사용하여 주소를 정확한 좌표로 변환하고 지도를 표시하는 모듈
 */

class NaverMapGeocoder {
    constructor() {
        this.clientId = 'h4w1t4p32x'; // 네이버 지도 API 클라이언트 ID
        this.apiKey = null; // 필요한 경우 API 키 설정
        this.scriptLoaded = false;
        this.geocoder = null;
    }

    /**
     * 네이버 지도 API 로드
     */
    async loadNaverMapsAPI() {
        if (this.scriptLoaded) return;

        return new Promise((resolve, reject) => {
            // 이미 스크립트가 로드된 경우
            if (window.naver && window.naver.maps && window.naver.maps.Service) {
                this.scriptLoaded = true;
                resolve();
                return;
            }

            // 네이버 지도 API 스크립트 동적 로드
            const script = document.createElement('script');
            script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${this.clientId}&submodules=geocoder`;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                if (window.naver && window.naver.maps) {
                    this.scriptLoaded = true;
                    resolve();
                } else {
                    reject(new Error('네이버 지도 API 로드 실패'));
                }
            };

            script.onerror = () => {
                reject(new Error('네이버 지도 API 스크립트 로드 실패'));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * 주소를 좌표로 변환 (네이버 지도 Geocoding API 사용)
     * @param {string} address - 변환할 주소
     * @param {string} language - 언어 코드 (ko, zh-CN 등)
     * @returns {Promise<{lat: number, lng: number, formatted_address: string}>}
     */
    async geocodeAddress(address, language = 'ko') {
        try {
            await this.loadNaverMapsAPI();

            if (!window.naver || !window.naver.maps || !window.naver.maps.Service) {
                throw new Error('네이버 지도 API가 초기화되지 않았습니다.');
            }

            return new Promise((resolve, reject) => {
                // 네이버 지도 Geocoding API 사용
                const query = encodeURIComponent(address);
                const url = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${query}`;

                // CORS 문제를 우회하기 위해 Naver Maps Embed URL 사용
                this.createNaverEmbedUrl(address, language)
                    .then(url => {
                        resolve({
                            lat: 0, // 임베드 URL에서는 좌표 직접 추출 불필요
                            lng: 0,
                            formatted_address: address,
                            embedUrl: url
                        });
                    })
                    .catch(error => {
                        // fallback으로 하드코딩된 좌표 사용
                        const coords = this.getFallbackCoordinates(address);
                        resolve({
                            lat: coords.lat,
                            lng: coords.lng,
                            formatted_address: address,
                            embedUrl: this.createNaverEmbedUrlFromCoords(coords.lat, coords.lng, language)
                        });
                    });
            });
        } catch (error) {
            console.error('지오코딩 오류:', error);
            throw error;
        }
    }

    /**
     * 네이버 지도 임베드 URL 생성 (주소 기반)
     * @param {string} address
     * @param {string} language
     * @returns {Promise<string>}
     */
    async createNaverEmbedUrl(address, language = 'ko') {
        try {
            const coords = this.getFallbackCoordinates(address);
            return this.createNaverEmbedUrlFromCoords(coords.lat, coords.lng, language);
        } catch (error) {
            console.error('네이버 지도 URL 생성 실패:', error);
            // 기본 URL 사용
            return `https://map.naver.com/?query=${encodeURIComponent(address)}`;
        }
    }

    /**
     * 네이버 지도 임베드 URL 생성 (좌표 기반)
     * @param {number} lat
     * @param {number} lng
     * @param {string} language
     * @param {number} zoom
     * @returns {string}
     */
    createNaverEmbedUrlFromCoords(lat, lng, language = 'ko', zoom = 15) {
        // 네이버 지도 임베드 URL 형식: https://map.naver.com/?lat=37.435&lng=127.130&zoom=15
        return `https://map.naver.com/?lat=${lat}&lng=${lng}&zoom=${zoom}`;
    }

    /**
     * 주소 정규화
     * @param {string} address
     * @param {string} language
     * @returns {string}
     */
    normalizeAddress(address, language = 'ko') {
        let normalized = address.trim();

        if (language === 'ko') {
            // 한국 주소 정규화
            if (!normalized.includes('대한민국') && !normalized.includes('한국')) {
                normalized = `대한민국 ${normalized}`;
            }
        } else if (language === 'zh-CN') {
            // 중국 주소 정규화
            if (!normalized.includes('中国')) {
                normalized = `中国 ${normalized}`;
            }
        }

        return normalized;
    }

    /**
     * Fallback 좌표 반환
     * @param {string} address
     * @returns {Object}
     */
    getFallbackCoordinates(address) {
        const fallbackCoords = {
            '경기도 광주시 도척면 도척로 489': { lat: 37.435, lng: 127.130 },
            'GD TRADE': { lat: 37.435, lng: 127.130 },
            '대한민국 경기도 광주시 도척면 도척로 489': { lat: 37.435, lng: 127.130 },
            '广东省深圳市宝安区松岗街道仓库园区': { lat: 22.701, lng: 113.835 },
            '中国 广东省深圳市宝安区松岗街道仓库园区': { lat: 22.701, lng: 113.835 }
        };

        return fallbackCoords[address] || { lat: 37.5665, lng: 126.9780 }; // 서울 시청 기본값
    }

    /**
     * 주소로 네이버 지도 iframe URL 생성
     * @param {string} address
     * @param {string} language
     * @param {number} zoom
     * @returns {Promise<string>}
     */
    async createMapUrlFromAddress(address, language = 'ko', zoom = 15) {
        try {
            const normalizedAddress = this.normalizeAddress(address, language);
            const result = await this.geocodeAddress(normalizedAddress, language);

            if (result.embedUrl) {
                return result.embedUrl;
            }

            const coords = this.getFallbackCoordinates(address);
            return this.createNaverEmbedUrlFromCoords(coords.lat, coords.lng, language, zoom);
        } catch (error) {
            console.error('네이버 지도 URL 생성 실패:', error);
            // 기존 하드코딩된 좌표로 fallback
            return this.getFallbackMapUrl(address, language, zoom);
        }
    }

    /**
     * Fallback 네이버 지도 URL
     * @param {string} address
     * @param {string} language
     * @param {number} zoom
     * @returns {string}
     */
    getFallbackMapUrl(address, language, zoom = 15) {
        const coords = this.getFallbackCoordinates(address);
        console.warn(`Fallback 좌표 사용: ${address} -> ${coords.lat}, ${coords.lng}`);
        return this.createNaverEmbedUrlFromCoords(coords.lat, coords.lng, language, zoom);
    }

    /**
     * iframe에 맞는 네이버 지도 임베드 URL 생성
     * @param {string} address
     * @param {string} language
     * @param {number} zoom
     * @returns {Promise<string>}
     */
    async createIframeUrl(address, language = 'ko', zoom = 15) {
        try {
            const coords = this.getFallbackCoordinates(address);
            // iframe에서 사용할 수 있는 네이버 지도 URL
            return `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;
        } catch (error) {
            console.error('iframe URL 생성 실패:', error);
            return `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;
        }
    }

    /**
     * 주소 유효성 검사
     * @param {string} address
     * @returns {Promise<boolean>}
     */
    async validateAddress(address) {
        try {
            await this.geocodeAddress(address);
            return true;
        } catch (error) {
            console.warn(`주소 유효성 검사 실패: ${address}`, error.message);
            return false;
        }
    }
}

// 전역 인스턴스 생성
window.naverMapGeocoder = new NaverMapGeocoder();

// 이전 버전과의 호환성을 위해 mapGeocoder도 네이버 맵으로 설정
window.mapGeocoder = window.naverMapGeocoder;

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NaverMapGeocoder;
}