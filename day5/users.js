// State variables
let usersData = [];

// DOM Elements
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusPara = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

// Renders an array of user objects to the DOM using createElement and textContent
function renderUsers(users) {
  usersList.textContent = "";

  if (users.length === 0) {
    const noResultsItem = document.createElement("li");
    noResultsItem.className = "no-results";
    noResultsItem.textContent = "No users match your filter.";
    usersList.appendChild(noResultsItem);
    return;
  }

  users.forEach((user) => {
    const li = document.createElement("li");
    li.className = "user-card";

    const nameEl = document.createElement("h3");
    nameEl.textContent = user.name;

    const emailEl = document.createElement("p");
    emailEl.textContent = `Email: ${user.email}`;

    const cityEl = document.createElement("p");
    cityEl.textContent = `City: ${user.address?.city || user.city || "N/A"}`;

    const companyEl = document.createElement("p");
    companyEl.textContent = `Company: ${user.company?.name || user.companyName || "N/A"}`;

    li.appendChild(nameEl);
    li.appendChild(emailEl);
    li.appendChild(cityEl);
    li.appendChild(companyEl);

    usersList.appendChild(li);
  });
}

// Asynchronously fetches user data from the API
async function loadUsers() {
  // Update state for loading phase
  loadButton.disabled = true;
  filterInput.disabled = true;
  statusPara.className = "loading";
  statusPara.textContent = "Loading users...";
  usersList.textContent = "";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    usersData = await response.json();

    statusPara.className = "success";
    statusPara.textContent = `Successfully loaded ${usersData.length} users.`;
    filterInput.disabled = false;
    filterInput.value = "";
    
    renderUsers(usersData);
  } catch (error) {
    statusPara.className = "error";
    statusPara.textContent = `Failed to load users: ${error.message}`;
    usersData = [];
    renderUsers([]);
  } finally {
    loadButton.disabled = false;
  }
}

// Filter handler
filterInput.addEventListener("input", (event) => {
  const searchTerm = event.target.value.toLowerCase().trim();
  const filteredUsers = usersData.filter((user) =>
    user.name.toLowerCase().includes(searchTerm)
  );
  renderUsers(filteredUsers);
});

// Event Listeners
loadButton.addEventListener("click", loadUsers);