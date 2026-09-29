import { bootEnv } from '../config/bootConfig.js';
import { taskServiceRequest } from './taskServiceRequest.js';
import { RecurringSyncTask, SyncTaskFilters } from '../types/syncTask.types.js';

const baseUrl = bootEnv.DIRECTOR_SERVICE_URL.replace(/\/+$/, '');

export const createSyncTask = (task: RecurringSyncTask) =>
    taskServiceRequest<RecurringSyncTask & { _id: string }>(
        'Director',
        `${baseUrl}/api/v1/tasks`,
        'POST',
        task,
    );

export const getSyncTasks = async (filters: SyncTaskFilters) => {
    const result = await taskServiceRequest<RecurringSyncTask[]>(
        'Director',
        `${baseUrl}/api/v1/tasks/search`,
        'POST',
        filters,
    );
    return result.data;
};

export const deleteSyncTasks = async (filters: SyncTaskFilters) => {
    const result = await taskServiceRequest<{
        deletedTasksCount: number;
        deletedExecutionsCount: number;
    }>('Director', `${baseUrl}/api/v1/tasks/search/delete`, 'POST', filters);
    return result.data;
};
