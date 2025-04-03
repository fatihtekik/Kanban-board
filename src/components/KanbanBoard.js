import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useNavigate } from 'react-router-dom';
import './KanbanBoard.css';

const API_URL = "http://127.0.0.1:8000";

// Фиксированные колонки
const initialColumns = {
  todo: { id: "todo", title: "To Do", taskIds: [] },
  in_progress: { id: "in_progress", title: "In Progress", taskIds: [] },
  done: { id: "done", title: "Done", taskIds: [] }
};

// Порядок колонок
const columnOrder = ["todo", "in_progress", "done"];

// Обрезаем контент, если он слишком длинный
function limitContentLength(str, maxLength = 50) {
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + "...";
  }
  return str;
}

/**
 * KanbanBoard, работающий с конкретной доской (boardId).
 * 
 * @param {string} token       - JWT-токен для запросов
 * @param {string} username    - Имя пользователя, чтобы приветствовать
 * @param {Function} onLogout  - Функция, вызывается при клике «Выйти»
 * @param {string} boardId     - ID выбранной доски (из URL)
 */
function KanbanBoard({ token, username, onLogout, boardId }) {
  // Приводим boardId к числу, если он определён
  const numericBoardId = boardId ? Number(boardId) : null;

  const [columns, setColumns] = useState(initialColumns);
  const [tasks, setTasks] = useState({});
  const [newTaskContent, setNewTaskContent] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!numericBoardId) {
      setColumns(initialColumns);
      setTasks({});
      return;
    }

    fetch(`${API_URL}/tasks?board_id=${numericBoardId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Ошибка авторизации или сети");
        }
        return response.json();
      })
      .then(data => {
        const tasksMap = {};
        const newColumns = {
          todo: { id: "todo", title: "To Do", taskIds: [] },
          in_progress: { id: "in_progress", title: "In Progress", taskIds: [] },
          done: { id: "done", title: "Done", taskIds: [] }
        };

        data.forEach(task => {
          task.content = limitContentLength(task.content, 50);
          tasksMap[task.id] = task;
          if (newColumns[task.column]) {
            newColumns[task.column].taskIds.push(task.id);
          }
        });
        Object.keys(newColumns).forEach(colKey => {
          newColumns[colKey].taskIds.sort((a, b) =>
            tasksMap[a].position - tasksMap[b].position
          );
        });

        setTasks(tasksMap);
        setColumns(newColumns);
      })
      .catch(err => console.error("Ошибка при загрузке задач:", err));
  }, [numericBoardId, token]);

  // 2. Обновление задачи на бэке
  const updateTaskBackend = (taskId, updatedTask) => {
    updatedTask.content = limitContentLength(updatedTask.content, 50);
    if (numericBoardId) {
      updatedTask.board_id = numericBoardId;
    }

    fetch(`${API_URL}/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(updatedTask)
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Ошибка при обновлении задачи");
        }
        return response.json();
      })
      .then(updated => {
        updated.content = limitContentLength(updated.content, 50);
        setTasks(prev => ({ ...prev, [taskId]: updated }));
      })
      .catch(err => console.error("Ошибка PUT /tasks:", err));
  };

  // 3. Drag & Drop (react-beautiful-dnd)
  const onDragEnd = result => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newColumnsState = { ...columns };
    const newTasksState = { ...tasks };
    const updates = [];

    const startCol = newColumnsState[source.droppableId];
    const finishCol = newColumnsState[destination.droppableId];

    if (startCol === finishCol) {
      // Перетаскивание внутри одной колонки
      const newTaskIds = Array.from(startCol.taskIds);
      newTaskIds.splice(source.index, 1);
      newTaskIds.splice(destination.index, 0, draggableId);

      newColumnsState[startCol.id] = {
        ...startCol,
        taskIds: newTaskIds
      };

      newTaskIds.forEach((taskId, index) => {
        newTasksState[taskId] = {
          ...newTasksState[taskId],
          position: index,
          column: startCol.id
        };
        updates.push({
          id: taskId,
          content: newTasksState[taskId].content,
          column: startCol.id,
          position: index
        });
      });
    } else {
      // Перетаскивание между колонками
      const startTaskIds = Array.from(startCol.taskIds);
      startTaskIds.splice(source.index, 1);

      const finishTaskIds = Array.from(finishCol.taskIds);
      finishTaskIds.splice(destination.index, 0, draggableId);

      newColumnsState[startCol.id] = { ...startCol, taskIds: startTaskIds };
      newColumnsState[finishCol.id] = { ...finishCol, taskIds: finishTaskIds };

      startTaskIds.forEach((taskId, index) => {
        newTasksState[taskId] = {
          ...newTasksState[taskId],
          position: index,
          column: startCol.id
        };
        updates.push({
          id: taskId,
          content: newTasksState[taskId].content,
          column: startCol.id,
          position: index
        });
      });

      finishTaskIds.forEach((taskId, index) => {
        newTasksState[taskId] = {
          ...newTasksState[taskId],
          position: index,
          column: finishCol.id
        };
        updates.push({
          id: taskId,
          content: newTasksState[taskId].content,
          column: finishCol.id,
          position: index
        });
      });
    }

    setColumns(newColumnsState);
    setTasks(newTasksState);

    setTimeout(() => {
      updates.forEach(u => {
        updateTaskBackend(u.id, {
          content: u.content,
          column: u.column,
          position: u.position,
          board_id: numericBoardId
        });
      });
    }, 0);
  };

  // 4. Добавление новой задачи
  const handleAddTask = () => {
    const content = newTaskContent.trim();
    if (!content || !numericBoardId) return;

    const position = columns.todo.taskIds.length;
    const limited = limitContentLength(content, 50);

    fetch(`${API_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        content: limited,
        column: "todo",
        position,
        board_id: numericBoardId
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Ошибка при создании задачи");
        }
        return response.json();
      })
      .then(newTask => {
        newTask.content = limitContentLength(newTask.content, 50);
        setTasks(prev => ({ ...prev, [newTask.id]: newTask }));
        setColumns(prev => ({
          ...prev,
          todo: {
            ...prev.todo,
            taskIds: [...prev.todo.taskIds, newTask.id]
          }
        }));
        setNewTaskContent("");
      })
      .catch(err => console.error("Ошибка POST /tasks:", err));
  };

  if (!numericBoardId) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Выберите доску</h2>
      </div>
    );
  }

  return (
    <div>
      {/* Шапка */}
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: '#eee' }}>
        <h1>Kanban-доска (ID: {numericBoardId})</h1>
        <div>
          <span>Привет, {username}!</span>
          <button onClick={() => { onLogout(); navigate('/login'); }} style={{ marginLeft: '10px' }}>
            Выйти
          </button>
        </div>
      </header>

      {/* Инпут для добавления задач */}
      <div style={{ padding: '10px 20px' }}>
        <input
          type="text"
          placeholder="Новая задача (до 50 символов)..."
          value={newTaskContent}
          onChange={e => setNewTaskContent(e.target.value)}
          style={{ width: '300px', marginRight: '10px' }}
        />
        <button onClick={handleAddTask}>Добавить в To Do</button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {columnOrder.map(colId => {
            const column = columns[colId];
            // Фильтруем undefined, если вдруг задачи не найдены
            const columnTasks = column.taskIds.map(tid => tasks[tid]).filter(task => task !== undefined);
            return (
              <div className="column" key={colId}>
                <h2>{column.title}</h2>
                <Droppable droppableId={colId}>
                  {(provided, snapshot) => (
                    <div
                      className={`task-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable key={String(task.id)} draggableId={String(task.id)} index={index}>
                          {(provided, snapshot) => (
                            <div
                              className={`task ${snapshot.isDragging ? 'dragging' : ''}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              {task.content}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}

export default KanbanBoard;
