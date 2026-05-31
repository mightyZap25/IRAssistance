import { db } from './src/firebase.js';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

async function deleteAllProjects() {
    try {
        const querySnapshot = await getDocs(collection(db, 'projects'));
        console.log(`Found ${querySnapshot.size} projects to delete.`);
        
        const deletePromises = querySnapshot.docs.map(document => 
            deleteDoc(doc(db, 'projects', document.id))
        );
        
        await Promise.all(deletePromises);
        console.log('Successfully deleted all projects.');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting projects:', error);
        process.exit(1);
    }
}

deleteAllProjects();
