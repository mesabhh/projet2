import React, { useState } from "react";
import { db } from "./firebase"; // Assurez-vous que Firebase est configuré
import { collection, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";

const GestionFormAdmin = () => {
  const [formName, setFormName] = useState("");
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({ text: "", rule: "" });

  const handleAddQuestion = () => {
    setQuestions([...questions, { ...newQuestion }]);
    setNewQuestion({ text: "", rule: "" });
  };

  const handleDeleteQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSaveForm = async () => {
    try {
      const docRef = await addDoc(collection(db, "forms"), {
        name: formName,
        questions: questions,
        isActive: false,
      });
      console.log("Form saved with ID: ", docRef.id);
    } catch (error) {
      console.error("Error saving form: ", error);
    }
  };

  const handleActivateForm = async (formId) => {
    try {
      const formRef = doc(db, "forms", formId);
      await updateDoc(formRef, { isActive: true });
      console.log("Form activated");
    } catch (error) {
      console.error("Error activating form: ", error);
    }
  };

  return (
    <div>
      <h1>Gestion des formulaires</h1>
      <div>
        <input
          type="text"
          placeholder="Nom du formulaire"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
        <button onClick={handleSaveForm}>Sauvegarder le formulaire</button>
      </div>
      <div>
        <h2>Questions</h2>
        {questions.map((q, index) => (
          <div key={index}>
            <p>{q.text}</p>
            <p>Règle IA : {q.rule}</p>
            <button onClick={() => handleDeleteQuestion(index)}>Supprimer</button>
          </div>
        ))}
        <div>
          <input
            type="text"
            placeholder="Texte de la question"
            value={newQuestion.text}
            onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
          />
          <input
            type="text"
            placeholder="Règle IA"
            value={newQuestion.rule}
            onChange={(e) => setNewQuestion({ ...newQuestion, rule: e.target.value })}
          />
          <button onClick={handleAddQuestion}>Ajouter une question</button>
        </div>
      </div>
    </div>
  );
};

export default GestionFormAdmin;