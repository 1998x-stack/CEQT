from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from models import db, User, Task
from loguru import logger
import json
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key_here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///tasks.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 配置日志
logger.add("app.log", rotation="10 MB", retention="10 days", level="DEBUG")

# 初始化数据库
db.init_app(app)

# 初始化登录管理
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        login_user(user)
        logger.info(f"User logged in: {username}")
        return jsonify({
            'success': True, 
            'user': {
                'id': user.id,
                'username': user.username,
                'initial': user.username[0].upper()
            }
        })
    
    logger.warning(f"Failed login attempt for: {username}")
    return jsonify({'success': False, 'message': '无效的用户名或密码'}), 401

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'message': '用户名已存在'}), 400
    
    new_user = User(username=username)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    
    logger.info(f"New user registered: {username}")
    return jsonify({'success': True})

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    return jsonify([task.to_dict() for task in tasks])

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.get_json()
    new_task = Task(
        user_id=current_user.id,
        title=data['title'],
        description=data.get('description', ''),
        category=data.get('category', 'other'),
        importance=data['importance'],
        urgency=data['urgency'],
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify(new_task.to_dict()), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    data = request.get_json()
    
    if 'title' in data:
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']
    if 'category' in data:
        task.category = data['category']
    if 'importance' in data:
        task.importance = data['importance']
    if 'urgency' in data:
        task.urgency = data['urgency']
    task.updated_at = datetime.now()
    
    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<int:task_id>/complete', methods=['POST'])
@login_required
def complete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    task.completed = True
    task.completed_at = datetime.now()
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    db.session.delete(task)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/user/stats')
@login_required
def user_stats():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.completed])
    pending_tasks = total_tasks - completed_tasks
    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
    
    return jsonify({
        'total_tasks': total_tasks,
        'completed_tasks': completed_tasks,
        'pending_tasks': pending_tasks,
        'completion_rate': completion_rate
    })

@app.route('/api/user/tasks')
@login_required
def user_tasks():
    tasks = Task.query.filter_by(user_id=current_user.id).order_by(Task.created_at.desc()).all()
    created_tasks = [t.to_dict() for t in tasks]
    completed_tasks = [t.to_dict() for t in tasks if t.completed]
    
    return jsonify({
        'created_tasks': created_tasks,
        'completed_tasks': completed_tasks
    })

@app.route('/api/user/category-stats')
@login_required
def category_stats():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    categories = ['work', 'personal', 'study', 'health', 'family', 'other']
    category_counts = {cat: 0 for cat in categories}
    
    for task in tasks:
        if task.category in category_counts:
            category_counts[task.category] += 1
    
    return jsonify(category_counts)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=8881)