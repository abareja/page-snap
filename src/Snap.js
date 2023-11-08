import { triggerEvent } from "../helpers";

class Snap {
  constructor(el, settings = {}) {
    if (!el) {
      console.error('No snap element provided');
      return;
    }

    this.settings = {
      itemsSelector: '.snap-item',
      itemContentSelector: '.snap-item__content',
      delay: 300,
      speed: 750,
      breakpoint: 992,
      ...settings,
    }

    this.elements = {
      parent: el,
      items: el.querySelectorAll(this.settings.itemsSelector),
      header: document.querySelector('header'),
    };

    this.items = [];

    this.state = {
      wait: false,
      initialized: false,
      current: 0,
      snapping: false,
      snappedToEnd: false,
    };

    if (this.elements.items.length === 0) {
      console.error('No snap items');
      return;
    }

    this.lethargy = new Lethargy(7, 100, 0.05);

    this.init();
  }

  debounce (callback) {
    let timeout;
  
    return (argument) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(argument), 250);
    };
  };

  init() {
    const action = e => {
      if(window.innerWidth > this.settings.breakpoint) {
        let previous = this.state.current;
        this.stop();
        this.start();
        this.snapTo(previous, true);
      } else {
        this.stop();
      }
    }

    window.addEventListener('resize', this.debounce(action));
    triggerEvent(window, 'resize');
  }

  start() {
    if(this.state.initialized) return;
    this.elements.parent.style = `--snap-speed: ${this.settings.speed}ms`; 
    this.elements.parent.style = `--snap-breakpoint: ${this.settings.breakpoint}px`;
    document.body.classList.add('snap-initialized');

    this.reset();
    this.setItems();
    this.initEvents();

    window.addEventListener('keydown', e => {
      if(e.key === 'Tab') {
        let activeElement = document.activeElement;
        let tabbedSnapItemIndex = activeElement.parentElement.closest('.snap-item')?.dataset.snapIndex;

        this.snapTo(tabbedSnapItemIndex, true);
      }
    });
  
    setTimeout(() => {
      this.state.initialized = true;
    }, this.settings.delay);
  }

  stop() {
    document.body.classList.remove('snap-initialized');
    this.state.initialized = false;
    $(this.elements.parent).unbind('scroll touchstart touchend touchmove mousewheel DOMMouseScroll wheel MozMousePixelScroll');
    this.elements.header.style.backgroundColor = 'transparent';
  }

  checkSnappedToEnd() {
    if (this.elements.parent.scrollTop === (this.elements.parent.scrollHeight - this.elements.parent.offsetHeight)) {
      this.state.snappedToEnd = true;
      this.elements.parent.style.overflow = 'hidden';
      document.body.classList.add('snapped-to-end');
    } else {
      this.state.snappedToEnd = false;
      document.body.classList.remove('snapped-to-end');
    }
  }

  setItems() {
    this.elements.items.forEach((item, index) => {
      this.items[index] = {
        el: item,
        scrollingEl: item.querySelector(this.settings.itemContentSelector) || item,
        offsetTop: $(item).offset().top,
        scrolledToStart: false,
        scrolledToEnd: false,
      };

      item.dataset.snapIndex = index;

      this.items.forEach(item => {
        const scrollingElement = item.scrollingEl;

        $(scrollingElement).unbind('scroll');
        $(scrollingElement).on('scroll', () => {
          this.state.wait = true;
          const scrolledToStart = scrollingElement.scrollTop < 1;
          const scrolledToEnd = scrollingElement.scrollHeight - scrollingElement.scrollTop - scrollingElement.clientHeight < 1;

          item.scrolledToStart = scrolledToStart;
          item.scrolledToEnd = scrolledToEnd;

          setTimeout(() => this.state.wait = false, this.settings.delay);
        });
        triggerEvent(scrollingElement, 'scroll');
      });
    });
  }

  wheelAction(e) {
    if (!this.state.initialized) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const currentItem = this.items[this.state.current];

    if (!currentItem) return;
    const { scrolledToStart, scrolledToEnd } = currentItem;
    const scrollDirection = this.lethargy.check(e);

    if (((scrollDirection === -1 && !scrolledToEnd) ||
      (scrollDirection === 1 && !scrolledToStart) ||
      (scrollDirection === false && e.originalEvent.deltaY > 0 && !scrolledToEnd) ||
      (scrollDirection === false && e.originalEvent.deltaY < 0 && !scrolledToStart)) && !this.state.snapping) {
      // allow to scroll by default
      return;
    }

    if ((this.state.snappedToEnd && scrollDirection === 1)
      || (this.state.snappedToEnd && scrollDirection === false && e.originalEvent.deltaY < 0)) {
      this.state.snappedToEnd = false;
      this.elements.parent.style.overflow = 'auto';
      return;
    } else if (this.state.snappedToEnd) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (this.state.snapping) {
      return;
    }

    if (!this.state.wait && scrollDirection === -1 && scrolledToEnd) {
      this.snapNext();
    }

    if (!this.state.wait && scrollDirection === 1 && scrolledToStart) {
      this.snapPrevious();
    }
  }

  initEvents() {
    const { parent } = this.elements;

    $(parent).on('scroll', this.checkSnappedToEnd.bind(this));
    $(parent).bind('mousewheel DOMMouseScroll wheel MozMousePixelScroll', e => this.wheelAction(e));

    let touchstartY = 0;
    let touchendY = 0;

    $(parent).bind('touchmove', e => {
      if (!e.cancelable) return;
      if (touchstartY > e.changedTouches[0].screenY && this.items[this.state.current].scrolledToEnd && !this.state.snappedToEnd) {
        e.preventDefault();
      }
      if (touchstartY < e.changedTouches[0].screenY && this.items[this.state.current].scrolledToStart && !this.state.snappedToEnd) {
        e.preventDefault();
      }
    });

    $(parent).bind('touchstart', e => {
      touchstartY = e.changedTouches[0].screenY;
    });

    $(parent).bind('touchend', e => {
      touchendY = e.changedTouches[0].screenY;
      const delta = touchendY - touchstartY;

      if (!this.state.snapping) {
        if (delta < 0 && Math.abs(delta) > 100) {
          if (this.items[this.state.current].scrolledToEnd) {
            this.snapNext();
          }
        } else if (delta > 0 && Math.abs(delta) > 100) {
          if (this.items[this.state.current].scrolledToStart) {
            this.snapPrevious();
          }
        }
      }
    });
  }

  startSnapping() {
    const item = this.items[this.state.current]?.el;

    if(!item) return; 

    const content = item.querySelector('.snap-item__content');

    item.classList.add('is-snapping');
    this.state.snapping = true;
    this.state.wait = true;

    $(document.documentElement).animate({
      scrollTop: 0
    }, this.settings.speed);

    if(content) {
      content.style.transform = `translateY(-100%)`;
    }
  }

  stopSnapping(callback = () => { }) {
    this.items.forEach(item => {
      item.el.classList.remove('is-snapped');
      item.el.classList.remove('is-snapping');
    });

    const item = this.items[this.state.current].el;
    const scrollingElement = this.items[this.state.current].scrollingEl;
    item.classList.add('is-snapped');
    item.classList.remove('is-snapping');
    triggerEvent(scrollingElement, 'scroll');
    this.setHeaderBg();

    setTimeout(() => {
      this.state.snapping = false;
      this.state.wait = false;
      callback();
    }, this.settings.delay);
  }

  animate(instant = false) {
    const item = this.items[this.state.current];

    if(!item) return;

    const content = item.el.querySelector('.snap-item__content');
    
    $(this.elements.parent).stop().animate({
      scrollTop: item?.offsetTop,
    }, {
      duration: instant ? 0 : this.settings.speed,
      complete: () => {
        this.stopSnapping();
      },
      progress: (animation, progress, remaining) => {
        if(!content) return;

        let value = Math.max((1 - progress) * 100 * Math.sin(1 - progress), 0);
        
        content.style.transform = `translateY(-${value}%)`
      }
    });
  }

  snapNext() {
    if (!this.state.snappedToEnd && this.state.initialized) {
      this.stopCurrentItemVideo();
      this.state.current = (this.state.current + 1) % this.items.length;
      this.startSnapping();
      this.animate();
      this.elements.header.classList.add('is-scrolled-down');
      this.elements.header.classList.remove('is-scrolled-up');
    }
  }

  snapPrevious() {
    if (this.state.current - 1 >= 0 && this.state.initialized) {
      this.stopCurrentItemVideo();
      this.state.current = Math.max(this.state.current - 1, 0);
      this.startSnapping();
      this.animate();
      this.elements.header.classList.add('is-scrolled-up');
      this.elements.header.classList.remove('is-scrolled-down');
    }
  }

  snapTo(index, instant = false) {
    if(index === this.state.current) {
      return;
    }

    this.stopCurrentItemVideo();
    const previousIndex = this.state.current;
    this.state.current = index;
    this.startSnapping();
    this.animate(instant);
    if(index < previousIndex) {
      this.elements.header.classList.add('is-scrolled-up');
      this.elements.header.classList.remove('is-scrolled-down');
    } else if(index > previousIndex){
      this.elements.header.classList.remove('is-scrolled-up');
      this.elements.header.classList.add('is-scrolled-down');
    }
  }

  reset() {
    document.body.scrollTop = 0;
    this.elements.parent.scrollTop = 0;
    this.state.current = 0;
    document.body.classList.remove('snapped-to-end');
    this.elements.header.style.backgroundColor = 'transparent';

    $(document.documentElement).animate({
      scrollTop: 0
    }, 200);
  }

  stopCurrentItemVideo() {
    const video = this.items[this.state.current]?.el.querySelector('.js-video');

    if (!video) return;

    videojs.getPlayer(video)?.pause();
  }

  setHeaderBg() {
    const currentItem = this.items[this.state.current]?.el;

    if(!currentItem) return;

    const bgColor = currentItem.dataset.headerBg ? currentItem.dataset.headerBg : 'transparent';
    this.elements.header.style.backgroundColor = bgColor;
  }

  isInitialized() {
    return this.state.initialized;
  }
}

export default (el, settings) => ({
  init() {
    const snap = new Snap(el, settings);
    window.snap = snap;
  }
});