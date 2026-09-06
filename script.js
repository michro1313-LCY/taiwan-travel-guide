const buttons = [...document.querySelectorAll('.filter')];
const cards = [...document.querySelectorAll('.guide-card')];
const count = document.querySelector('#resultCount');

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    buttons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    let visible = 0;
    cards.forEach((card) => {
      const show = filter === 'all' || card.dataset.category.split(' ').includes(filter);
      card.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });
    count.textContent = `${visible} 篇攻略`;
  });
});
