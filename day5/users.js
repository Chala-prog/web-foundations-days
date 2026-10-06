let allUsers = [];

const loadBtn = document.getElementById('load-users');
const filterInput = document.getElementById('filter-input');
const statusP = document.getElementById('status');
const usersList = document.getElementById('users-list');

async function loadUsers() {
  statusP.textContent = 'Loading users...';
  loadBtn.disabled = true;
  usersList.innerHTML = '';

  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users');

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    allUsers = await response.json();
    statusP.textContent = 'Users loaded successfully.';
    renderUsers(allUsers);
  } catch (error) {
    statusP.textContent = `Error loading users: ${error.message}`;
  } finally {
    loadBtn.disabled = false;
  }
}

function renderUsers(list) {
  usersList.innerHTML = '';

  if (list.length === 0) {
    statusP.textContent = 'No users match your filter.';
    return;
  }

  statusP.textContent = `Showing ${list.length} user(s).`;

  list.forEach(user => {
    const li = document.createElement('li');

    const nameEl = document.createElement('strong');
    nameEl.textContent = user.name;

    const detailsEl = document.createElement('p');
    const cityName = user.address ? user.address.city : 'N/A';
    const companyName = user.company ? user.company.name : 'N/A';

    detailsEl.textContent = `Email: ${user.email} | City: ${cityName} | Company: ${companyName}`;

    li.appendChild(nameEl);
    li.appendChild(detailsEl);
    usersList.appendChild(li);
  });
}

loadBtn.addEventListener('click', loadUsers);

filterInput.addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase().trim();
  const filtered = allUsers.filter(user =>
    user.name.toLowerCase().includes(query)
  );
  renderUsers(filtered);
});