/**
 * @TAG: TDD-IMPLEMENTATION-GREEN
 * ServiceGallery 클래스 - Owl Carousel 구현
 * GREEN Phase: 테스트 통과를 위한 Owl Carousel 통합
 */

class ServiceGallery {
    constructor(container = null) {
        this.container = container || document.querySelector('#services-gallery');
        this.owlCarousel = null;
        this.autoSlideInterval = null;
        this.isAutoSliding = false;
        this.init();
    }

    init() {
        // DOM이 로드된 후 초기화
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeComponents();
            });
        } else {
            this.initializeComponents();
        }
    }

    initializeComponents() {
        // jQuery가 로드되었는지 확인 후 Owl Carousel 초기화
        if (typeof $ !== 'undefined') {
            this.initializeOwlCarousel();
        }

        // 이미지 에러 핸들링은 항상 설정
        this.setupImageErrorHandling();
        this.setupAutoSlide();
        this.setupMouseEvents();

        // 이미지 로드 상태 확인
        this.checkImageLoading();
    }

    // 이미지 로드 상태 확인
    checkImageLoading() {
        // 이미지가 모두 로드될 때까지 잠시 기다림
        setTimeout(() => {
            if (this.container) {
                const images = this.container.querySelectorAll('.service-thumbnail img');
                if (images) {
                    images.forEach((img, index) => {
                        console.log(`Image ${index + 1}:`, img.src, 'Loaded:', img.complete && img.naturalHeight > 0);
                    });
                }
            }
        }, 1000);
    }

    initializeOwlCarousel() {
        const $owlCarousel = $(this.container).find('.owl-carousel');

        if ($owlCarousel.length) {
            this.owlCarousel = $owlCarousel.owlCarousel({
                // 기본 설정
                items: 3,                    // 화면에 표시될 아이템 수
                margin: 30,                // 아이템 간 간격
                loop: true,                  // 무한 루핑
                nav: true,                   // 네비게이션 표시
                dots: false,                 // 도트 네비게이션 비활성화
                autoWidth: false,            // 자동 너비 비활성화
                stagePadding: 0,             // 스테이지 패딩
                navText: [
                    '<i class="fas fa-chevron-left"></i>',
                    '<i class="fas fa-chevron-right"></i>'
                ],
                dotsEach: true,             // 도트 개별 제어
                autoplay: true,               // 자동 재생
                autoplayTimeout: 2000,       // 자동 재생 대기 시간 (2초)
                autoplayHoverPause: true,      // 마우스 오버 시 일시 정지
                smartSpeed: 1000,           // 스마트 속도
                fluidSpeed: 1000,           // 유동 속도
                responsive: {
                    // 반응형 설정
                    0: {
                        items: 1,        // 모바일: 1개 표시
                        margin: 15,
                        nav: false,
                        dots: false
                    },
                    600: {
                        items: 2,        // 작은 태블릿: 2개 표시
                        margin: 20,
                        nav: false,
                        dots: false
                    },
                    768: {
                        items: 2,        // 태블릿: 2개 표시
                        margin: 25,
                        nav: true,
                        dots: false
                    },
                    1024: {
                        items: 3,        // 중간 화면: 3개 표시
                        margin: 30,
                        nav: true,
                        dots: false
                    },
                    1200: {
                        items: 4,        // 큰 화면: 4개 표시
                        margin: 30,
                        nav: true,
                        dots: false
                    }
                },
                // 애니메이션 효과
                animateIn: 'fadeIn',
                animateOut: 'fadeOut',
                // 터력 전환 시 효과
                transitionStyle: 'fade',
                // RTL 지원
                rtl: false
            });

            // Owl Carousel 이벤트 핸들러 연결
            this.owlCarousel.on('translated.owl.carousel', () => {
                this.onTranslated();
            });

            this.owlCarousel.on('changed.owl.carousel', () => {
                this.onChanged();
            });

            this.owlCarousel.on('dragged.owl.carousel', () => {
                this.onDragged();
            });

            this.owlCarousel.on('refreshed.owl.carousel', () => {
                this.onRefreshed();
            });
        }
    }

    // Owl Carousel 이벤트 핸들러
    onTranslated() {
        // 슬라이드 완료 후 호출
        console.log('Carousel slid to position:', this.owlCarousel.find('.owl-item').index());
    }

    onChanged() {
        // 아이템 변경 시 호출
        console.log('Carousel item changed');
    }

    onDragged() {
        // 드래그 중일 때 마우스 오버 정지
        console.log('Carousel dragged');
    }

    onRefreshed() {
        // 캐러시 완료 후 호출
        console.log('Carousel refreshed');
    }

    // 이미지 에러 핸들링 (픽토그램 사용으로 불필요)
    setupImageErrorHandling() {
        // Font Awesome 아이콘을 사용하므로 이미지 에러 핸들링 불필요
        console.log('Using pictograms instead of images - no error handling needed');
    }

    // 자동 슬라이드 설정
    setupAutoSlide() {
        this.autoSlideInterval = setInterval(() => {
            if (this.isAutoSliding && this.owlCarousel) {
                this.next();
            }
        }, 4000);
    }

    // 마우스 이벤트 설정
    setupMouseEvents() {
        if (this.container) {
            this.container.addEventListener('mouseenter', () => {
                this.isAutoSliding = true;
            });

            this.container.addEventListener('mouseleave', () => {
                this.isAutoSliding = false;
            });
        }
    }

    // 메서드
    next() {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('next.owl.carousel');
        }
    }

    prev() {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('prev.owl.carousel');
        }
    }

    goTo(position) {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('to.owl.carousel', [position]);
        }
    }

    play() {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('play.owl.autoplay', [1000]);
        }
    }

    stop() {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('stop.owl.autoplay');
        }
    }

    update() {
        if (this.owlCarousel) {
            this.owlCarousel.trigger('refresh.owl.carousel');
        }
    }

    // 정리 메소드
    cleanup() {
        if (this.autoSlideInterval) {
            clearInterval(this.autoSlideInterval);
            this.autoSlideInterval = null;
        }
        if (this.owlCarousel) {
            this.owlCarousel.trigger('destroy.owl.carousel');
            this.owlCarousel = null;
        }
    }
}

// 전역으로 클래스 노출
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceGallery;
} else {
    window.ServiceGallery = ServiceGallery;
}