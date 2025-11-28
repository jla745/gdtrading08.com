/**
 * China Market Tour Page JavaScript
 * workwave.co.kr inspired functionality
 */

// Initialize AOS
AOS.init({
    duration: 1000,
    once: true,
    offset: 100
});

// Navigation scroll effect
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.backdropFilter = 'blur(10px)';
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
    } else {
        navbar.style.background = '#ffffff';
        navbar.style.backdropFilter = 'none';
        navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }
});

// Smooth scroll to form
function scrollToForm() {
    const formSection = document.querySelector('.tour-form-section');
    if (formSection) {
        formSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Smooth scroll to contact
function scrollToContact() {
    const contactSection = document.querySelector('.contact-info-section');
    if (contactSection) {
        contactSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Category detail modal
function showCategoryDetail(category) {
    const categoryData = {
        toys: {
            title: '완구/취미용품',
            description: '세계 완구 생산의 80%를 차지하는 이우시장 완구 구역입니다. 최신 트렌드의 완구부터 교육용 완구까지 다양한 상품이 있습니다.',
            products: ['플라스틱 완구', '인형', 'RC 장난감', '교육용 완구', '보드게임'],
            image: 'https://via.placeholder.com/600x400?text=Toys+Category'
        },
        electronics: {
            title: '전자제품',
            description: 'IT 기기부터 가전제품까지 최신 전자제품을 취급하는 구역입니다. OEM/ODM 생산도 가능합니다.',
            products: ['스마트폰 액세서리', '컴퓨터 주변기기', '가전제품', '전자부품'],
            image: 'https://via.placeholder.com/600x400?text=Electronics+Category'
        },
        fashion: {
            title: '의류/패션',
            description: '최신 트렌드의 의류와 패션 아이템을 취급하는 구역입니다. 소량 생산부터 대량 주문까지 가능합니다.',
            products: ['여성 의류', '남성 의류', '아동복', '패션 액세서리'],
            image: 'https://via.placeholder.com/600x400?text=Fashion+Category'
        },
        home: {
            title: '생활용품',
            description: '일상생활에 필요한 모든 생활용품을 취급하는 구역입니다. 주방용품부터 청소용품까지 다양합니다.',
            products: ['주방용품', '욕실용품', '청소용품', '수납용품'],
            image: 'https://via.placeholder.com/600x400?text=Home+Category'
        },
        beauty: {
            title: '뷰티/미용',
            description: '코스메틱과 뷰티용품을 전문적으로 취급하는 구역입니다. 최신 뷰티 트렌드 상품이 있습니다.',
            products: ['스킨케어', '메이크업', '헤어케어', '뷰티 도구'],
            image: 'https://via.placeholder.com/600x400?text=Beauty+Category'
        },
        accessories: {
            title: '액세서리',
            description: '시계, 가방, 잡화 등 패션 액세서리를 취급하는 구역입니다. 가성비 좋은 상품이 많습니다.',
            products: ['가방', '지갑', '벨트', '시계', '선글라스'],
            image: 'https://via.placeholder.com/600x400?text=Accessories+Category'
        }
    };

    const data = categoryData[category];
    if (!data) return;

    // Create modal HTML
    const modalHTML = `
        <div id="categoryModal" class="category-modal">
            <div class="modal-overlay" onclick="closeCategoryModal()"></div>
            <div class="modal-content">
                <button class="modal-close" onclick="closeCategoryModal()">
                    <i class="fas fa-times"></i>
                </button>
                <div class="modal-header">
                    <img src="${data.image}" alt="${data.title}" class="modal-image">
                    <h2>${data.title}</h2>
                </div>
                <div class="modal-body">
                    <p>${data.description}</p>
                    <h3>주요 상품:</h3>
                    <ul>
                        ${data.products.map(product => `<li>${product}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add modal styles
    if (!document.querySelector('#categoryModalStyles')) {
        const styles = `
            <style id="categoryModalStyles">
                .category-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease;
                }

                .modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.7);
                    backdrop-filter: blur(5px);
                }

                .modal-content {
                    position: relative;
                    background: white;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    border-radius: 15px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: slideUp 0.3s ease;
                }

                .modal-close {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: #f1f3f4;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 1.2rem;
                    color: #666;
                    transition: all 0.3s ease;
                }

                .modal-close:hover {
                    background: #e8eaed;
                    color: #333;
                }

                .modal-header {
                    text-align: center;
                    padding: 30px 30px 20px;
                }

                .modal-image {
                    width: 100%;
                    max-width: 400px;
                    height: 200px;
                    object-fit: cover;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .modal-header h2 {
                    color: #2c3e50;
                    margin: 0;
                    font-size: 1.8rem;
                }

                .modal-body {
                    padding: 0 30px 30px;
                }

                .modal-body p {
                    color: #555;
                    line-height: 1.6;
                    margin-bottom: 20px;
                }

                .modal-body h3 {
                    color: #2c3e50;
                    font-size: 1.3rem;
                    margin-bottom: 10px;
                }

                .modal-body ul {
                    list-style: none;
                    padding: 0;
                }

                .modal-body li {
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                    color: #555;
                    position: relative;
                    padding-left: 20px;
                }

                .modal-body li:before {
                    content: '•';
                    color: #3498db;
                    position: absolute;
                    left: 0;
                    font-weight: bold;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .modal-content {
                        width: 95%;
                        margin: 20px;
                    }

                    .modal-header,
                    .modal-body {
                        padding: 20px;
                    }

                    .modal-header h2 {
                        font-size: 1.5rem;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Close category modal
function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// Form validation and submission
document.addEventListener('DOMContentLoaded', function() {
    const tourForm = document.getElementById('tourForm');
    if (tourForm) {
        tourForm.addEventListener('submit', handleFormSubmit);
    }

    // Set minimum date to today
    const visitDateInput = document.getElementById('visitDate');
    if (visitDateInput) {
        const today = new Date().toISOString().split('T')[0];
        visitDateInput.min = today;
    }
});

function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        phone: formData.get('phone'),
        visitDate: formData.get('visitDate'),
        visitors: formData.get('visitors'),
        pickupArrival: formData.get('pickupArrival'),
        pickupReturn: formData.get('pickupReturn'),
        tourDays: formData.get('tourDays'),
        hotel: formData.get('hotel'),
        additional: formData.get('additional')
    };

    // Validate required fields
    if (!data.name || !data.phone || !data.visitDate || !data.visitors) {
        showNotification('필수 항목을 모두 입력해주세요.', 'error');
        return;
    }

    // Validate phone number
    const phoneRegex = /^01([0|1|6|7|8|9])-?([0-9]{3,4})-?([0-9]{4})$/;
    if (!phoneRegex.test(data.phone.replace(/-/g, ''))) {
        showNotification('올바른 전화번호 형식을 입력해주세요.', 'error');
        return;
    }

    // Show success message
    showNotification('투어 신청이 완료되었습니다. 전문가가 빠른 시간 내에 연락드리겠습니다.', 'success');

    // Log form data (in production, this would be sent to a server)
    console.log('Tour Application Data:', data);

    // Reset form after successful submission
    setTimeout(() => {
        e.target.reset();
    }, 2000);
}

// Reset form
function resetForm() {
    const form = document.getElementById('tourForm');
    if (form) {
        form.reset();
        showNotification('폼이 초기화되었습니다.', 'info');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    // Add notification styles if not exists
    if (!document.querySelector('#notificationStyles')) {
        const styles = `
            <style id="notificationStyles">
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    max-width: 400px;
                    z-index: 3000;
                    animation: slideInRight 0.3s ease;
                }

                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px 20px;
                    border-radius: 10px;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    font-weight: 500;
                }

                .notification-success .notification-content {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }

                .notification-error .notification-content {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }

                .notification-info .notification-content {
                    background: #d1ecf1;
                    color: #0c5460;
                    border: 1px solid #bee5eb;
                }

                .notification i {
                    font-size: 1.2rem;
                }

                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(100px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes slideOutRight {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(100px);
                    }
                }

                @media (max-width: 768px) {
                    .notification {
                        top: 10px;
                        left: 10px;
                        right: 10px;
                        max-width: none;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success':
            return 'fa-check-circle';
        case 'error':
            return 'fa-exclamation-circle';
        case 'info':
        default:
            return 'fa-info-circle';
    }
}

// Insurance card click handlers
document.addEventListener('DOMContentLoaded', function() {
    const insuranceCards = document.querySelectorAll('.insurance-card');
    insuranceCards.forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            const companyName = this.querySelector('h4').textContent;
            showNotification(`${companyName} 보험 상담을 위해 전문가가 연락드리겠습니다.`, 'info');
        });
    });
});

// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Add loading states to buttons
document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('button[type="submit"], .hero-cta');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            if (!this.disabled) {
                const originalText = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';

                setTimeout(() => {
                    this.disabled = false;
                    this.innerHTML = originalText;
                }, 2000);
            }
        });
    });
});