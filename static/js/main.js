// 全局变量
let tasks = [];
let currentTaskId = null;
let isEditing = false;
let isDragging = false;
let dragTask = null;
let categoryChart = null;
let currentUser = null;

// 紧急程度标签和坐标
const urgencyLabels = ['1年', '半年', '3个月', '1个月', '1周', '3天', '1天', '10小时', '4小时', '2小时', '1小时', '30分钟', '15分钟'];
const importanceLabels = ['1星', '2星', '3星', '4星', '5星', '6星', '7星'];

// 颜色配置
const priorityColors = ['#4444ff', '#0088cc', '#00cc88', '#88cc00', '#ffcc00', '#ff8800', '#ff4444'];
const categoryColors = ['#FF6B6B', '#4ECDC4', '#FFD166', '#6A0572', '#1A936F', '#114B5F'];

// 同时修改DOMContentLoaded中的初始化逻辑
document.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initMatrix();  // 确保矩阵总是初始化
        loadUserData();
        document.getElementById('main-page').style.display = 'block';
        document.getElementById('userAvatar').textContent = currentUser.initial;
    } else {
        document.getElementById('loginModal').style.display = 'flex';
    }
    
    setupEventListeners();
});

/**
 * 初始化矩阵：绘制网格线和标签
 * 确保以矩阵中心为原点，将 urgency 映射到 -6~6，将 importance 映射到 -3~3
 */
function initMatrix() {
    const matrix = document.getElementById('matrix');
    matrix.innerHTML = '';
    
    // 获取矩阵当前宽高
    const width = matrix.offsetWidth;
    const height = matrix.offsetHeight;
    // 计算单元像素尺寸
    const cellWidth = width / 12;   // 13 条纵线形成 12 个间隔
    const cellHeight = height / 6;  // 7 条横线形成 6 个间隔
    // 百分比单元大小
    const cellWidthPct = 100 / 12;  // 每个水平间隔对应的百分比
    const cellHeightPct = 100 / 6;  // 每个垂直间隔对应的百分比

    // 绘制四象限标签和坐标轴
    matrix.innerHTML += `
        <div class="quadrant-label q1">重要不紧急</div>
        <div class="quadrant-label q2">重要紧急</div>
        <div class="quadrant-label q3">不重要不紧急</div>
        <div class="quadrant-label q4">不重要紧急</div>
        <div class="axis axis-x"></div>
        <div class="axis axis-y"></div>
        <button class="add-button" id="addButton" onclick="showAddTaskModal()">+</button>
        <div class="tooltip" id="taskTooltip"></div>
    `;

    // 绘制垂直网格线（13 条），i 从 0 到 12
    for (let i = 0; i <= 12; i++) {
        const line = document.createElement('div');
        line.className = 'grid-line vertical';
        // 垂直线位置：中心线在 50%，其余按 (i - 6) * cellWidthPct
        // left = 50% + (i - 6) * cellWidthPct
        line.style.left = `calc(50% + ${(i - 6) * cellWidthPct}%)`;
        matrix.appendChild(line);

        // 绘制紧急度标签
        if (i < urgencyLabels.length) {
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = urgencyLabels[i];
            // 修改位置：在矩阵内部底部显示
            label.style.left = `calc(50% + ${(i - 6) * cellWidthPct * 7 / 8}% - 20px)`;
            label.style.bottom = '5px'; // 在矩阵底部内部显示
            // 设置透明度渐变
            const opacity = 0.3 + (i / 12) * 0.7;
            label.style.opacity = opacity;
            matrix.appendChild(label);
        }
    }

    // 绘制水平网格线（7 条），i 从 0 到 6
    for (let i = 0; i <= 6; i++) {
        const line = document.createElement('div');
        line.className = 'grid-line horizontal';
        // 水平线位置：中心线在 50%，其余按 (3 - i) * cellHeightPct
        // 当 i=3（importance=4）时，(3-3)=0 => y=50%；i=0 时 (3-0)=3 => y=50%+3*cellHeightPct（最下方）
        line.style.top = `calc(50% + ${(3 - i) * cellHeightPct}%)`;
        matrix.appendChild(line);

        // 绘制重要度标签
        if (i < importanceLabels.length) {
            const label = document.createElement('div');
            label.className = 'label importance-label';
            // 显示文本：importanceLabels[i] 对应 i 从 0 到 6
            label.textContent = importanceLabels[i];
            // 修改位置：在矩阵内部左侧显示
            label.style.left = '5px'; // 在矩阵左侧内部显示
            label.style.top = `calc(50% + ${(3 - i) * cellHeightPct * 5 / 6}% - 8px)`;
            // 根据重要度设置颜色和加粗：importance 从 1（i=0）到 7（i=6），映射 priorityColors[i]
            if (i < priorityColors.length) {
                label.style.color = priorityColors[i];
                label.style.fontWeight = 'bold';
            }
            matrix.appendChild(label);
        }
    }
}

function setupEventListeners() {
    const matrix = document.getElementById('matrix');
    const tooltip = document.getElementById('taskTooltip');
    
    // 鼠标移动显示添加按钮
    matrix.addEventListener('mousemove', function(e) {
        if (isDragging) return;
        
        const rect = matrix.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const addButton = document.getElementById('addButton');
        addButton.style.left = (x - 20) + 'px';
        addButton.style.top = (y - 20) + 'px';
        addButton.style.display = 'flex';
        
        // 存储当前坐标
        addButton.dataset.x = x;
        addButton.dataset.y = y;
    });

    matrix.addEventListener('mouseleave', function() {
        if (!isDragging) {
            document.getElementById('addButton').style.display = 'none';
            tooltip.style.opacity = '0';
        }
    });
    
    // 重要程度滑块
    document.getElementById('importanceSlider').addEventListener('input', function() {
        updateImportanceDisplay(this.value);
    });

    // 紧急程度选择
    document.getElementById('urgencySelect').addEventListener('change', function() {
        updateUrgencyDisplay(this.value);
    });
    
    // 窗口大小改变时重新渲染
    window.addEventListener('resize', function() {
        setTimeout(renderTasks, 100);
        if (categoryChart) {
            categoryChart.resize();
        }
    });
}

function loginUser() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!username) {
        alert('请输入用户名');
        return;
    }
    
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            document.getElementById('userAvatar').textContent = data.user.initial;
            closeLoginModal();
            document.getElementById('main-page').style.display = 'block';
            initMatrix();  // 确保矩阵初始化
            loadUserData();
        } else {
            alert(data.message || '登录失败');
        }
    })
    .catch(error => {
        console.error('登录错误:', error);
        alert('登录过程中发生错误');
    });
}

function registerUser() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    
    if (!username) {
        alert('请输入用户名');
        return;
    }
    
    if (password.length < 3) {
        alert('密码长度至少为3位');
        return;
    }
    
    if (password !== confirm) {
        alert('两次输入的密码不一致');
        return;
    }
    
    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('注册成功，请登录');
            closeRegisterModal();
            showLoginForm();
        } else {
            alert(data.message || '注册失败');
        }
    })
    .catch(error => {
        console.error('注册错误:', error);
        alert('注册过程中发生错误');
    });
}

function loadUserData() {
    if (!currentUser) return;
    
    // 先确保矩阵初始化
    initMatrix();
    
    // 然后加载任务
    fetch('/api/tasks')
    .then(response => response.json())
    .then(data => {
        tasks = data;
        renderTasks();
    })
    .catch(error => {
        console.error('加载任务失败:', error);
        alert('加载任务时发生错误');
        // 即使加载失败，矩阵也已初始化，可以添加新任务
    });
}

function coordinateToPosition(urgency, importance) {
    const matrix = document.getElementById('matrix');
    const width = matrix.offsetWidth;
    const height = matrix.offsetHeight;

    // 计算单元像素尺寸
    const cellWidth = width / 12;
    const cellHeight = height / 6;
    // 半个单元像素偏移
    const halfCellWidth = cellWidth / 2;
    const halfCellHeight = cellHeight / 2;

    // X 方向：在原先基础上 + 半个单元偏移
    const x = halfCellWidth + urgency * cellWidth;
    // Y 方向：注意原先 y = (7 - importance) * cellHeight，需要 + 半个单元偏移
    const y = halfCellHeight + (7 - importance) * cellHeight;

    return { x, y };
}

function positionToCoordinate(x, y) {
    const matrix = document.getElementById('matrix');
    const width = matrix.offsetWidth;
    const height = matrix.offsetHeight;

    const cellWidth = width / 12;
    const cellHeight = height / 6;
    const halfCellWidth = cellWidth / 2;
    const halfCellHeight = cellHeight / 2;

    // 先将鼠标坐标减去半个单元的偏移，再按单元大小计算索引
    const adjX = x - halfCellWidth;
    const adjY = y - halfCellHeight;

    let urgency = Math.round(adjX / cellWidth);
    let importance = 7 - Math.round(adjY / cellHeight);

    // 边界限制
    urgency = Math.max(0, Math.min(12, urgency));
    importance = Math.max(1, Math.min(7, importance));

    return {
        urgency,
        importance
    };
}

function getTaskColor(importance, urgency) {
    const baseColor = priorityColors[importance - 1];
    const opacity = 0.4 + (urgency / 12) * 0.6; // 紧急程度影响透明度
    return baseColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
}

function showAddTaskModal() {
    const addButton = document.getElementById('addButton');
    const x = parseFloat(addButton.dataset.x);
    const y = parseFloat(addButton.dataset.y);
    const coords = positionToCoordinate(x, y);
    
    isEditing = false;
    document.getElementById('modalTitle').textContent = '添加新任务';
    document.getElementById('taskForm').reset();
    document.getElementById('importanceSlider').value = coords.importance;
    document.getElementById('urgencySelect').value = coords.urgency;
    updateImportanceDisplay(coords.importance);
    updateUrgencyDisplay(coords.urgency);
    
    document.getElementById('taskModal').style.display = 'flex';
}

function showEditTaskModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    isEditing = true;
    currentTaskId = taskId;
    document.getElementById('modalTitle').textContent = '编辑任务';
    
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDesc').value = task.description || '';
    document.getElementById('taskCategory').value = task.category || 'other';
    document.getElementById('importanceSlider').value = task.importance;
    document.getElementById('urgencySelect').value = task.urgency;
    updateImportanceDisplay(task.importance);
    updateUrgencyDisplay(task.urgency);
    
    document.getElementById('taskModal').style.display = 'flex';
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    currentTaskId = null;
    isEditing = false;
}

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDesc').value.trim();
    const category = document.getElementById('taskCategory').value;
    const importance = parseInt(document.getElementById('importanceSlider').value);
    const urgency = parseInt(document.getElementById('urgencySelect').value);

    if (!title) {
        alert('请输入任务标题');
        return;
    }

    const taskData = {
        title,
        description,
        category,
        importance,
        urgency
    };

    if (isEditing && currentTaskId) {
        fetch(`/api/tasks/${currentTaskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        })
        .then(response => response.json())
        .then(data => {
            loadUserData();
            closeTaskModal();
        })
        .catch(error => {
            console.error('更新任务失败:', error);
            alert('更新任务时发生错误');
        });
    } else {
        fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        })
        .then(response => response.json())
        .then(data => {
            tasks.push(data);
            renderTasks();
            closeTaskModal();
        })
        .catch(error => {
            console.error('创建任务失败:', error);
            alert('创建任务时发生错误');
        });
    }
}

function renderTasks() {
    const matrix = document.getElementById('matrix');
    const tooltip = document.getElementById('taskTooltip');
    
    // 清除现有任务元素
    matrix.querySelectorAll('.task-item').forEach(el => el.remove());
    
    tasks.filter(task => !task.completed).forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = 'task-item';
        taskElement.dataset.taskId = task.id;
        
        const position = coordinateToPosition(task.urgency, task.importance);
        taskElement.style.left = (position.x - 16) + 'px';
        taskElement.style.top = (position.y - 16) + 'px';
        taskElement.style.backgroundColor = getTaskColor(task.importance, task.urgency);
        
        // 显示任务标题首字
        taskElement.textContent = task.title.charAt(0);
        
        // 任务提示信息
        const info = `${task.title}\n重要程度: ${task.importance}星\n紧急程度: ${urgencyLabels[task.urgency]}\n分类: ${getCategoryName(task.category)}`;
        
        // 悬停显示任务信息
        taskElement.addEventListener('mouseenter', function(e) {
            tooltip.textContent = info;
            tooltip.style.opacity = '1';
        });
        
        taskElement.addEventListener('mouseleave', function() {
            tooltip.style.opacity = '0';
        });
        
        // 右键菜单
        taskElement.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showContextMenu(e, task.id);
        });

        // 拖拽功能
        taskElement.addEventListener('mousedown', function(e) {
            if (e.button === 0) { // 左键
                isDragging = true;
                dragTask = task;
                taskElement.style.zIndex = '100';
                
                const moveHandler = function(e) {
                    if (!isDragging) return;
                    
                    const rect = matrix.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    taskElement.style.left = (x - 16) + 'px';
                    taskElement.style.top = (y - 16) + 'px';
                };
                
                const upHandler = function(e) {
                    if (!isDragging) return;
                    
                    isDragging = false;
                    taskElement.style.zIndex = '10';
                    
                    const rect = matrix.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const coords = positionToCoordinate(x, y);
                    
                    // 更新任务坐标
                    fetch(`/api/tasks/${dragTask.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            urgency: coords.urgency,
                            importance: coords.importance
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        loadUserData();
                    })
                    .catch(error => {
                        console.error('更新任务位置失败:', error);
                        alert('更新任务位置时发生错误');
                    });
                    
                    dragTask = null;
                    
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('mouseup', upHandler);
                };
                
                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('mouseup', upHandler);
            }
        });
        
        matrix.appendChild(taskElement);
    });
}

function showContextMenu(e, taskId) {
    currentTaskId = taskId;
    const menu = document.getElementById('contextMenu');
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.style.display = 'block';
}

function editTask() {
    document.getElementById('contextMenu').style.display = 'none';
    showEditTaskModal(currentTaskId);
}

function completeTask() {
    fetch(`/api/tasks/${currentTaskId}/complete`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadUserData();
            updateUserProfile();
        }
    })
    .catch(error => {
        console.error('完成任务失败:', error);
        alert('完成任务时发生错误');
    });
    
    document.getElementById('contextMenu').style.display = 'none';
}

function deleteTask() {
    if (confirm('确定要删除这个任务吗？')) {
        fetch(`/api/tasks/${currentTaskId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadUserData();
                updateUserProfile();
            }
        })
        .catch(error => {
            console.error('删除任务失败:', error);
            alert('删除任务时发生错误');
        });
    }
    document.getElementById('contextMenu').style.display = 'none';
}

function updateImportanceDisplay(value) {
    document.getElementById('currentImportance').textContent = value + '星';
    document.getElementById('currentImportance').style.color = priorityColors[value-1];
    document.getElementById('currentImportance').style.fontWeight = 'bold';
}

function updateUrgencyDisplay(value) {
    document.getElementById('currentUrgency').textContent = urgencyLabels[value];
}

function showUserProfile() {
    document.getElementById('main-page').style.display = 'none';
    document.getElementById('user-page').style.display = 'block';
    document.getElementById('userProfileName').textContent = `${currentUser.username} 的任务管理`;
    updateUserProfile();
}

function showMainPage() {
    document.getElementById('main-page').style.display = 'block';
    document.getElementById('user-page').style.display = 'none';
}

function updateUserProfile() {
    updateStats();
    renderCategoryChart();
    updateCreatedTasks();
    updateCompletedTasks();
}

function updateStats() {
    fetch('/api/user/stats')
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('stats-container');
        container.innerHTML = `
            <div class="stat-card">
                <div class="label">总任务数</div>
                <div class="value">${data.total_tasks}</div>
            </div>
            <div class="stat-card completed">
                <div class="label">已完成</div>
                <div class="value">${data.completed_tasks}</div>
            </div>
            <div class="stat-card pending">
                <div class="label">进行中</div>
                <div class="value">${data.pending_tasks}</div>
            </div>
            <div class="stat-card">
                <div class="label">完成率</div>
                <div class="value">${data.completion_rate}%</div>
            </div>
        `;
    })
    .catch(error => {
        console.error('获取统计数据失败:', error);
        alert('获取统计数据时发生错误');
    });
}

function renderCategoryChart() {
    fetch('/api/user/category-stats')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const categories = Object.keys(data);
        const counts = Object.values(data);
        const names = categories.map(cat => getCategoryName(cat));
        
        // 销毁旧图表
        if (categoryChart) {
            categoryChart.destroy();
        }
        
        // 创建新图表
        categoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: names,
                datasets: [{
                    data: counts,
                    backgroundColor: categoryColors,
                    borderColor: 'white',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: {
                                size: 12
                            },
                            padding: 15
                        }
                    },
                    title: {
                        display: true,
                        text: '任务分类分布',
                        font: {
                            size: 16
                        }
                    }
                }
            }
        });
    })
    .catch(error => {
        console.error('获取分类统计数据失败:', error);
        alert('获取分类统计数据时发生错误');
    });
}

function updateCreatedTasks() {
    fetch('/api/user/tasks')
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('created-tasks');
        if (data.created_tasks.length === 0) {
            container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无创建的任务</p>';
            return;
        }
        
        container.innerHTML = data.created_tasks.map(task => {
            const color = getTaskColor(task.importance, task.urgency);
            return `
            <div class="timeline-item">
                <div class="timeline-badge" style="background: ${color}">
                    ${task.title.charAt(0)}
                </div>
                <div class="timeline-date">${formatDate(task.created_at)}</div>
                <div class="timeline-content">
                    <div class="timeline-title">${task.title}</div>
                    <div class="timeline-desc">
                        <span class="tag">${getCategoryName(task.category)}</span>
                        <span class="tag">${task.importance}星</span>
                        <span class="tag">${urgencyLabels[task.urgency]}</span>
                        ${task.completed ? '<span class="tag" style="background:#4CAF50;color:white;">✅ 已完成</span>' : '<span class="tag" style="background:#FF9800;color:white;">进行中</span>'}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    })
    .catch(error => {
        console.error('获取创建的任务失败:', error);
        alert('获取创建的任务时发生错误');
    });
}

function updateCompletedTasks() {
    fetch('/api/user/tasks')
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('completed-tasks');
        if (data.completed_tasks.length === 0) {
            container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无完成的任务</p>';
            return;
        }
        
        container.innerHTML = data.completed_tasks.map(task => {
            const color = getTaskColor(task.importance, task.urgency);
            return `
            <div class="timeline-item">
                <div class="timeline-badge" style="background: ${color}">
                    ${task.title.charAt(0)}
                </div>
                <div class="timeline-date">${formatDate(task.completed_at)}</div>
                <div class="timeline-content">
                    <div class="timeline-title">✅ ${task.title}</div>
                    <div class="timeline-desc">
                        <span class="tag">${getCategoryName(task.category)}</span>
                        <span class="tag">${task.importance}星</span>
                        <span class="tag">${urgencyLabels[task.urgency]}</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    })
    .catch(error => {
        console.error('获取完成的任务失败:', error);
        alert('获取完成的任务时发生错误');
    });
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 2) {
        return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays <= 7) {
        return diffDays + '天前';
    } else {
        return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
}

function getCategoryName(category) {
    const categoryMap = {
        'work': '工作',
        'personal': '个人',
        'study': '学习',
        'health': '健康',
        'family': '家庭',
        'other': '其他'
    };
    return categoryMap[category] || '其他';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'flex';
}

function showLoginForm() {
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('loginModal').style.display = 'flex';
}

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    // ESC键关闭模态框
    if (e.key === 'Escape') {
        closeTaskModal();
        document.getElementById('contextMenu').style.display = 'none';
    }
    
    // Ctrl+N 新建任务
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        // 在中心位置显示添加按钮
        const addButton = document.getElementById('addButton');
        const matrix = document.getElementById('matrix');
        addButton.dataset.x = matrix.offsetWidth / 2;
        addButton.dataset.y = matrix.offsetHeight / 2;
        showAddTaskModal();
    }
});