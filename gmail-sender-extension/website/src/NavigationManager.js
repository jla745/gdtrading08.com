/**
 * @TAG: TDD-IMPLEMENTATION-GREEN
 * NavigationManager 클래스 - 최소 기능 구현
 * GREEN Phase: 테스트 통과를 위한 기본 구현
 */

class NavigationManager {
    constructor(container = null) {
        this.container = container || document.querySelector('.navbar');
        this.navToggle = null;
        this.navTabs = null;
        this.init();
    }

    init() {
        this.setupMobileToggle();
        this.setupActiveState();
        this.setupDropdownToggle();
        this.setupAccessibility();
        this.setupResponsive();
        // Initialize accessibility attributes
        this.updateAriaLabel();
    }

    // 모바일 메뉴 토글
    setupMobileToggle() {
        this.navToggle = this.container?.querySelector('.nav-toggle');
        this.navTabs = this.container?.querySelector('.nav-tabs');

        if (this.navToggle && this.navTabs) {
            this.navToggle.addEventListener('click', () => {
                this.navTabs.classList.toggle('active');
                this.updateAriaLabel();
            });
        }
    }

    // 현재 페이지 활성 상태 설정
    setupActiveState() {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';

        const links = this.container?.querySelectorAll('.nav-tabs-link');
        if (links) {
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href === currentPage ||
                    (currentPage === '' && href === 'index.html')) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }
    }

    // 모바일 드롭다운 토글
    setupDropdownToggle() {
        if (window.innerWidth <= 768) {
            const dropdowns = this.container?.querySelectorAll('.nav-tabs-dropdown');
            if (dropdowns) {
                dropdowns.forEach(dropdown => {
                    const link = dropdown.querySelector('.nav-tabs-link');
                    if (link) {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            dropdown.classList.toggle('active');
                        });
                    }
                });
            }
        }
    }

    // 접근성 업데이트
    updateAriaLabel() {
        if (this.navToggle && this.navTabs) {
            const isActive = this.navTabs.classList.contains('active');
            this.navToggle.setAttribute('aria-label',
                isActive ? '메뉴 닫기' : '메뉴 열기'
            );
            this.navToggle.setAttribute('aria-expanded', isActive);
            this.navToggle.setAttribute('aria-controls', 'nav-tabs');
        }
    }

    // 키보드 내비게이션
    setupAccessibility() {
        const links = this.container?.querySelectorAll('.nav-tabs-link');
        if (links) {
            links.forEach(link => {
                link.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        link.click();
                    }
                });
            });
        }
    }

    // 반응형 설정
    setupResponsive() {
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    handleResize() {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            this.setupDropdownToggle();
        }
    }

    // 정리 메소드
    cleanup() {
        // 이벤트 리스너 제거
        if (this.navToggle) {
            this.navToggle.removeEventListener('click', () => {});
        }

        window.removeEventListener('resize', () => {});
    }
}

// 전역으로 클래스 노출
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}